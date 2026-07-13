import type { FastifyInstance } from 'fastify';
import * as XLSX from 'xlsx';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

interface ImportRow {
  row: number;
  name: string;
  price: number | null;
  sku?: string;
  description?: string;
  category?: string;
  stockQty: number;
  costPrice?: number;
  unit: string;
  isActive: boolean;
  // Uzbekistan fiscal/marking codes + weighted-goods fields — same
  // columns Product itself gained (schema.prisma comment on
  // Product.mxikCode/packageCode/isByWeight/pluCode/vatRate).
  mxikCode?: string;
  packageCode?: string;
  barcode?: string;
  vatRate: number | null;
  isByWeight: boolean;
  pluCode?: string;
  // resolved
  categoryId?: string;
  action: 'create' | 'update';
  errors: string[];
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_\-]+/g, '_');
}

function toBool(v: any, def = true): boolean {
  if (v === undefined || v === null || v === '') return def;
  const s = String(v).trim().toLowerCase();
  if (['0', 'false', 'нет', 'no', 'скрыт', 'inactive'].includes(s)) return false;
  return true;
}

function toNum(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseSheet(buffer: Buffer): Record<string, any>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const headers = (rows[0] as string[]).map(normalizeHeader);
  return rows.slice(1).map((row: any[]) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

const COL = {
  name: ['name', 'название', 'наименование', 'nom', 'nomi'],
  price: ['price', 'цена', 'narx'],
  sku: ['sku', 'артикул', 'код', 'article'],
  description: ['description', 'описание', 'tavsif'],
  category: ['category', 'категория', 'toifa'],
  stockQty: ['stock', 'stock_qty', 'stockqty', 'остаток', 'qoldiq', 'quantity', 'qty'],
  costPrice: ['cost', 'cost_price', 'costprice', 'себестоимость', 'tannarx'],
  unit: ['unit', 'ед', 'единица', 'birlik'],
  isActive: ['active', 'is_active', 'isactive', 'активен', 'faol', 'status'],
  mxikCode: ['mxik', 'mxik_code', 'mxikcode', 'икпу', 'икпу_код'],
  packageCode: ['package_code', 'packagecode', 'код_упаковки', 'package'],
  barcode: ['barcode', 'штрихкод', 'ean', 'ean13', 'шк'],
  vatRate: ['vat', 'vat_rate', 'ндс', 'налог'],
  isByWeight: ['is_by_weight', 'весовой', 'by_weight'],
  pluCode: ['plu', 'plu_code', 'plu_код'],
};

function pick(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    if (k in row) return String(row[k] ?? '').trim();
  }
  return '';
}

export default async function importRoutes(fastify: FastifyInstance) {
  // Download CSV template
  fastify.get('/products/import/template', async (_request, reply) => {
    const csv = [
      'name,price,sku,description,category,stockQty,costPrice,unit,isActive,mxikCode,packageCode,barcode,vatRate,isByWeight,pluCode',
      'Пример товара,50000,SKU-001,Описание,Категория,10,30000,шт,true,01234567890000000,1234567,,12,false,',
      'Морковь свежая,3000,,,Овощи,0,1500,кг,true,00706001001000000,1356510,2200113,,true,001',
    ].join('\n');
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="products_template.csv"');
    return reply.send('\uFEFF' + csv); // BOM for Excel
  });

  // Preview or apply import
  fastify.post(
    '/products/import',
    { preHandler: [permissionGuard('manageCatalog')] },
    async (request, reply) => {
      const preview = (request.query as any).preview !== 'false';

      const file = await request.file();
      if (!file) return reply.status(400).send({ success: false, error: 'No file uploaded' });

      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/csv',
        'text/plain',
      ];
      const ext = file.filename.split('.').pop()?.toLowerCase();
      if (!allowedTypes.includes(file.mimetype) && !['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
        return reply.status(400).send({ success: false, error: 'Accepted formats: .xlsx, .xls, .csv' });
      }

      const buffer = await file.toBuffer();
      if (buffer.length > 5 * 1024 * 1024) {
        return reply.status(400).send({ success: false, error: 'File too large (max 5 MB)' });
      }

      let rawRows: Record<string, any>[];
      try {
        rawRows = parseSheet(buffer);
      } catch {
        return reply.status(400).send({ success: false, error: 'Cannot parse file. Use .xlsx or .csv format.' });
      }

      if (rawRows.length === 0) {
        return reply.status(400).send({ success: false, error: 'File is empty or has no data rows.' });
      }
      if (rawRows.length > 2000) {
        return reply.status(400).send({ success: false, error: 'Too many rows (max 2000 per import).' });
      }

      const tenantId = request.tenantId!;

      // Load existing categories and products (by SKU) for matching
      const [existingCategories, existingSkus] = await Promise.all([
        prisma.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
        prisma.product.findMany({
          where: { tenantId, sku: { not: null } },
          select: { id: true, sku: true },
        }),
      ]);

      const catMap = new Map(existingCategories.map((c) => [c.name.toLowerCase().trim(), c.id]));
      const skuMap = new Map(existingSkus.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase().trim(), p.id]));

      const rows: ImportRow[] = rawRows.map((raw, i) => {
        const errors: string[] = [];

        const name = pick(raw, COL.name);
        if (!name) errors.push('Название обязательно');

        const priceRaw = pick(raw, COL.price);
        const price = toNum(priceRaw);
        if (price === null) errors.push('Цена обязательна и должна быть числом');
        else if (price < 0) errors.push('Цена не может быть отрицательной');

        const sku = pick(raw, COL.sku) || undefined;
        const description = pick(raw, COL.description) || undefined;
        const categoryName = pick(raw, COL.category);
        const stockQtyRaw = toNum(pick(raw, COL.stockQty));
        const stockQty = stockQtyRaw !== null ? Math.max(0, Math.round(stockQtyRaw)) : 0;
        const costPriceRaw = toNum(pick(raw, COL.costPrice));
        // '' (unspecified), not 'dona' — matches Product.unit's own
        // "absent means unconfigured" convention (schema.prisma comment).
        const unit = pick(raw, COL.unit) || '';
        const isActive = toBool(pick(raw, COL.isActive), true);

        const mxikCode = pick(raw, COL.mxikCode) || undefined;
        const packageCode = pick(raw, COL.packageCode) || undefined;
        const barcode = pick(raw, COL.barcode) || undefined;
        const vatRate = toNum(pick(raw, COL.vatRate));
        const pluCode = pick(raw, COL.pluCode) || undefined;
        // isByWeight has no independent source of truth in this app —
        // useProductForm.ts's saveProduct derives it purely from unit
        // ('кг'/'г'), with no separate checkbox. An isByWeight column is
        // still recognized (COL.isByWeight) so a template built from an
        // export round-trips its header, but the applied value always
        // matches the UI's own invariant rather than trusting a
        // conflicting explicit column value.
        const isByWeight = unit === 'кг' || unit === 'г';

        let categoryId: string | undefined;
        if (categoryName) {
          categoryId = catMap.get(categoryName.toLowerCase().trim());
          if (!categoryId) errors.push(`Категория не найдена: "${categoryName}"`);
        }

        const existingId = sku ? skuMap.get(sku.toLowerCase().trim()) : undefined;
        const action: 'create' | 'update' = existingId ? 'update' : 'create';

        return {
          row: i + 2,
          name,
          price,
          sku,
          description,
          category: categoryName || undefined,
          stockQty,
          costPrice: costPriceRaw !== null ? costPriceRaw : undefined,
          unit,
          isActive,
          mxikCode,
          packageCode,
          barcode,
          vatRate,
          isByWeight,
          pluCode,
          categoryId,
          action,
          errors,
        };
      });

      const valid = rows.filter((r) => r.errors.length === 0);
      const invalid = rows.filter((r) => r.errors.length > 0);

      if (preview) {
        return {
          success: true,
          data: {
            preview: true,
            rows: rows.map(({ categoryId: _cid, ...r }) => r),
            summary: { total: rows.length, valid: valid.length, errors: invalid.length },
          },
        };
      }

      // Apply valid rows
      if (valid.length === 0) {
        return reply.status(400).send({ success: false, error: 'No valid rows to import.' });
      }

      let created = 0;
      let updated = 0;
      const applyErrors: { row: number; error: string }[] = [];

      for (const row of valid) {
        let productId: string | undefined;
        try {
          const payload: any = {
            name: row.name,
            price: row.price!,
            stockQty: row.stockQty,
            unit: row.unit,
            isActive: row.isActive,
            isByWeight: row.isByWeight,
            // null is meaningful here (Product.vatRate: "use the store's
            // taxProfile.vatRate default") — always set, not conditional
            // like the optional string fields below.
            vatRate: row.vatRate,
          };
          if (row.sku) payload.sku = row.sku;
          if (row.description) payload.description = row.description;
          if (row.categoryId) payload.categoryId = row.categoryId;
          if (row.costPrice !== undefined) payload.costPrice = row.costPrice;
          if (row.mxikCode) payload.mxikCode = row.mxikCode;
          if (row.packageCode) payload.packageCode = row.packageCode;
          if (row.pluCode) payload.pluCode = row.pluCode;

          if (row.action === 'update' && row.sku) {
            const existingId = skuMap.get(row.sku.toLowerCase().trim())!;
            await prisma.product.update({ where: { id: existingId }, data: payload });
            productId = existingId;
            updated++;
          } else {
            const createdProduct = await prisma.product.create({ data: { tenantId, ...payload } });
            productId = createdProduct.id;
            created++;
          }
        } catch (e: any) {
          applyErrors.push({ row: row.row, error: e.message });
          continue;
        }

        // Barcode is attached in a separate step, after the product itself
        // is committed — a barcode conflict must not undo or block the
        // product create/update that already succeeded above, only get
        // reported alongside it.
        if (row.barcode) {
          try {
            const existingBarcode = await prisma.productBarcode.findFirst({
              where: { tenantId, barcode: row.barcode },
              select: { id: true, productId: true },
            });
            if (existingBarcode && existingBarcode.productId !== productId) {
              applyErrors.push({ row: row.row, error: `Штрихкод "${row.barcode}" уже используется другим товаром` });
            } else if (!existingBarcode) {
              // Same "reset any existing default, then create" transaction
              // as POST /products/:id/barcodes (product/routes.ts) — at
              // most one isDefault per product.
              await prisma.$transaction(async (tx: any) => {
                await tx.productBarcode.updateMany({ where: { productId, isDefault: true }, data: { isDefault: false } });
                await tx.productBarcode.create({
                  data: { tenantId, productId, barcode: row.barcode!, type: 'EAN13', isDefault: true, unitQty: 1 },
                });
              });
            }
            // else: existingBarcode already belongs to this same product
            // (e.g. re-running the same import) — nothing to do.
          } catch (err: any) {
            if (err?.code === 'P2002') {
              applyErrors.push({ row: row.row, error: `Штрихкод "${row.barcode}" уже используется другим товаром` });
            } else {
              applyErrors.push({ row: row.row, error: err.message });
            }
          }
        }
      }

      return {
        success: true,
        data: {
          preview: false,
          summary: {
            total: rows.length,
            valid: valid.length,
            created,
            updated,
            skipped: invalid.length,
            applyErrors,
          },
        },
      };
    }
  );
}
