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
      'name,price,sku,description,category,stockQty,costPrice,unit,isActive',
      'Пример товара,50000,SKU-001,Описание,Категория,10,30000,dona,true',
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
        const unit = pick(raw, COL.unit) || 'dona';
        const isActive = toBool(pick(raw, COL.isActive), true);

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
        try {
          const payload: any = {
            name: row.name,
            price: row.price!,
            stockQty: row.stockQty,
            unit: row.unit,
            isActive: row.isActive,
          };
          if (row.sku) payload.sku = row.sku;
          if (row.description) payload.description = row.description;
          if (row.categoryId) payload.categoryId = row.categoryId;
          if (row.costPrice !== undefined) payload.costPrice = row.costPrice;

          if (row.action === 'update' && row.sku) {
            const existingId = skuMap.get(row.sku.toLowerCase().trim())!;
            await prisma.product.update({ where: { id: existingId }, data: payload });
            updated++;
          } else {
            await prisma.product.create({ data: { tenantId, ...payload } });
            created++;
          }
        } catch (e: any) {
          applyErrors.push({ row: row.row, error: e.message });
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
