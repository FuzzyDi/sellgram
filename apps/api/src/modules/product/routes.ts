import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { uploadFile, ensureBucket, resolveBucketAndObjectPath, buildProductImageObjectPath } from '../../lib/s3.js';
import { triggerCatalogRefresh } from '../pos-sync/admin-routes.js';
import crypto from 'node:crypto';

const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().max(200).optional(),
  categoryId: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
});

const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  // 0 is valid — a draft/unfilled product, priced later by a manager.
  price: z.number().min(0),
  costPrice: z.number().positive().optional(),
  sku: z.string().optional(),
  mxikCode: z.string().optional(),
  packageCode: z.string().optional(),
  vatRate: z.number().min(0).optional(),
  vatExempt: z.boolean().optional(),
  markType: z.string().optional(),
  isMarked: z.boolean().optional(),
  unit: z.string().optional(),
  isByWeight: z.boolean().optional(),
  isWeightedPiece: z.boolean().optional(),
  productTypeId: z.string().nullable().optional(),
  pluCode: z.string().optional(),
  pricePerKg: z.number().min(0).optional(),
  stockQty: z.number().int().min(0).default(0),
  lowStockAlert: z.number().int().min(0).default(5),
  variants: z.array(z.object({
    name: z.string(),
    sku: z.string().optional(),
    price: z.number().positive().optional(),
    stockQty: z.number().int().min(0).default(0),
  })).optional(),
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  // 0 is valid — see createProductSchema's price comment above.
  price: z.number().min(0).optional(),
  costPrice: z.number().positive().nullable().optional(),
  sku: z.string().nullable().optional(),
  mxikCode: z.string().nullable().optional(),
  packageCode: z.string().nullable().optional(),
  vatRate: z.number().min(0).nullable().optional(),
  vatExempt: z.boolean().optional(),
  markType: z.string().nullable().optional(),
  isMarked: z.boolean().optional(),
  unit: z.string().nullable().optional(),
  isByWeight: z.boolean().optional(),
  isWeightedPiece: z.boolean().optional(),
  productTypeId: z.string().nullable().optional(),
  pluCode: z.string().nullable().optional(),
  pricePerKg: z.number().min(0).nullable().optional(),
  stockQty: z.number().int().min(0).optional(),
  lowStockAlert: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export default async function productRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // Product types (docs/PRODUCT_TYPES.md §11) — global, read-only for
  // tenants. Only enabled types are exposed; disabling a type in System
  // Admin hides it from this list without deleting it or unassigning it
  // from products that already reference it.
  fastify.get('/product-types', async () => {
    const data = await prisma.productType.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data };
  });

  // List products
  fastify.get('/products', async (request, reply) => {
    let query: z.infer<typeof listProductsQuerySchema>;
    try {
      query = listProductsQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const { page, pageSize, search, categoryId, active } = query;
    const skip = (page - 1) * pageSize;

    const where: any = { tenantId: request.tenantId!, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (active !== undefined) where.isActive = active === 'true'; // active is 'true'|'false' from schema

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          variants: { where: { isActive: true } },
          _count: { select: { orderItems: true } },
        },
        orderBy: { sortOrder: 'asc' },
        skip,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      success: true,
      data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // Get single product
  fastify.get('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, tenantId: request.tenantId!, deletedAt: null },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      },
    });
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });
    return { success: true, data: product };
  });

  // Create product
  fastify.post('/products', {
    preHandler: [permissionGuard('manageCatalog'), planGuard('maxProducts')],
  }, async (request, reply) => {
    try {
      const body = createProductSchema.parse(request.body);
      if (body.categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: body.categoryId, tenantId: request.tenantId!, isActive: true },
        });
        if (!category) {
          return reply.status(400).send({ success: false, error: 'Invalid category' });
        }
      }

      // docs/PRODUCT_TYPES.md §3.1 — assigning a productTypeId denormalizes
      // markType/isByWeight/isWeightedPiece from the type onto the product
      // in the same write, overriding any of those three fields also
      // present in this same request body. Only fires when productTypeId
      // is actually being assigned to a real type here, not on every save.
      let typeSyncFields: { markType?: string | null; isByWeight?: boolean; isWeightedPiece?: boolean } = {};
      if (body.productTypeId) {
        const type = await prisma.productType.findUnique({ where: { id: body.productTypeId } });
        if (!type) return reply.status(400).send({ success: false, error: 'Invalid product type' });
        typeSyncFields = {
          markType: type.markType,
          isByWeight: type.weightMode !== 'PIECE',
          isWeightedPiece: type.weightMode === 'PIECE_WEIGHT',
        };
      }

      const product = await prisma.product.create({
        data: {
          tenantId: request.tenantId!,
          name: body.name,
          description: body.description,
          categoryId: body.categoryId,
          price: body.price,
          costPrice: body.costPrice,
          sku: body.sku,
          mxikCode: body.mxikCode,
          packageCode: body.packageCode,
          vatRate: body.vatRate,
          vatExempt: body.vatExempt,
          markType: body.markType,
          isMarked: body.isMarked,
          unit: body.unit,
          isByWeight: body.isByWeight,
          isWeightedPiece: body.isWeightedPiece,
          productTypeId: body.productTypeId ?? undefined,
          pluCode: body.pluCode,
          pricePerKg: body.pricePerKg,
          stockQty: body.stockQty,
          lowStockAlert: body.lowStockAlert,
          variants: body.variants ? { create: body.variants } : undefined,
          ...typeSyncFields,
        },
        include: { variants: true, images: true },
      });
      await triggerCatalogRefresh(request.tenantId!);
      return { success: true, data: product };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Bulk update products (activate / deactivate)
  const bulkProductSchema = z.object({
    ids: z.array(z.string().cuid()).min(1).max(200),
    action: z.enum(['activate', 'deactivate']),
  });

  fastify.patch('/products/bulk', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    let body: z.infer<typeof bulkProductSchema>;
    try {
      body = bulkProductSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const isActive = body.action === 'activate';
    const result = await prisma.product.updateMany({
      where: { id: { in: body.ids }, tenantId: request.tenantId! },
      data: { isActive },
    });
    await triggerCatalogRefresh(request.tenantId!);
    return { success: true, updated: result.count };
  });

  // Update product
  fastify.patch('/products/:id', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const body = updateProductSchema.parse(request.body);
      if (body.categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: body.categoryId, tenantId: request.tenantId!, isActive: true },
        });
        if (!category) {
          return reply.status(400).send({ success: false, error: 'Invalid category' });
        }
      }

      // §3.1 — same sync as create, only when productTypeId is present in
      // this write (assigning null just unassigns, without touching the
      // three synced fields — the sync is one-directional, not a standing
      // invariant enforced on every save).
      let typeSyncFields: { markType?: string | null; isByWeight?: boolean; isWeightedPiece?: boolean } = {};
      if (body.productTypeId) {
        const type = await prisma.productType.findUnique({ where: { id: body.productTypeId } });
        if (!type) return reply.status(400).send({ success: false, error: 'Invalid product type' });
        typeSyncFields = {
          markType: type.markType,
          isByWeight: type.weightMode !== 'PIECE',
          isWeightedPiece: type.weightMode === 'PIECE_WEIGHT',
        };
      }

      const product = await prisma.product.updateMany({
        where: { id, tenantId: request.tenantId! },
        data: { ...body, ...typeSyncFields } as any,
      });
      if (product.count === 0) return reply.status(404).send({ success: false, error: 'Product not found' });
      await triggerCatalogRefresh(request.tenantId!);
      return { success: true, message: 'Product updated' };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Delete (soft)
  fastify.delete('/products/:id', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.product.updateMany({
      where: { id, tenantId: request.tenantId!, deletedAt: null },
      data: { isActive: false, deletedAt: new Date() },
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Product not found' });
    await triggerCatalogRefresh(request.tenantId!);
    return { success: true, message: 'Product deactivated' };
  });

  // Variant CRUD
  const variantBodySchema = z.object({
    name: z.string().min(1).max(100),
    sku: z.string().max(100).optional(),
    price: z.number().positive().nullable().optional(),
    stockQty: z.number().int().min(0).default(0),
    isActive: z.boolean().optional(),
  });

  fastify.post('/products/:id/variants', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({ where: { id, tenantId: request.tenantId!, deletedAt: null }, select: { id: true } });
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });

    let body: z.infer<typeof variantBodySchema>;
    try {
      body = variantBodySchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const variant = await prisma.productVariant.create({
      data: { productId: id, name: body.name, sku: body.sku, price: body.price ?? null, stockQty: body.stockQty },
    });
    return { success: true, data: variant };
  });

  fastify.patch('/products/:id/variants/:variantId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, variantId } = request.params as { id: string; variantId: string };
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId: id, product: { tenantId: request.tenantId! } },
    });
    if (!variant) return reply.status(404).send({ success: false, error: 'Variant not found' });

    let body: Partial<z.infer<typeof variantBodySchema>>;
    try {
      body = variantBodySchema.partial().parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const updated = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.sku !== undefined && { sku: body.sku }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.stockQty !== undefined && { stockQty: body.stockQty }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return { success: true, data: updated };
  });

  fastify.delete('/products/:id/variants/:variantId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, variantId } = request.params as { id: string; variantId: string };
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId: id, product: { tenantId: request.tenantId! } },
    });
    if (!variant) return reply.status(404).send({ success: false, error: 'Variant not found' });
    await prisma.productVariant.delete({ where: { id: variantId } });
    return { success: true, message: 'Variant deleted' };
  });

  // Barcode CRUD (packages/prisma/schema.prisma ProductBarcode) — a
  // product can have several scannable codes (e.g. a unit EAN and a
  // case/block EAN with a different unitQty); at most one is
  // isDefault (printed on receipts/labels).
  const createBarcodeSchema = z.object({
    barcode: z.string().min(1).max(64),
    type: z.enum(['EAN13', 'EAN8', 'CODE128', 'DATAMATRIX', 'QR']).default('EAN13'),
    isDefault: z.boolean().default(false),
    unitQty: z.number().positive().optional(),
    variantId: z.string().optional(),
  });

  fastify.get('/products/:id/barcodes', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({ where: { id, tenantId: request.tenantId!, deletedAt: null }, select: { id: true } });
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });

    const barcodes = await prisma.productBarcode.findMany({
      where: { productId: id },
      orderBy: [{ isDefault: 'desc' }, { barcode: 'asc' }],
    });
    return { success: true, data: barcodes };
  });

  fastify.post('/products/:id/barcodes', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;
    const parsed = createBarcodeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const { barcode, type, isDefault, unitQty, variantId } = parsed.data;

    const product = await prisma.product.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });

    if (variantId) {
      const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId: id }, select: { id: true } });
      if (!variant) return reply.status(404).send({ success: false, error: 'Variant not found for this product' });
    }

    // Pre-check for a clear 409 — @@unique([tenantId, barcode]) is the
    // real guarantee, backstopped by the P2002 catch below against a
    // concurrent identical insert.
    const existing = await prisma.productBarcode.findFirst({ where: { tenantId, barcode }, select: { id: true } });
    if (existing) {
      return reply.status(409).send({ success: false, error: 'BARCODE_ALREADY_EXISTS' });
    }

    let created;
    try {
      created = await prisma.$transaction(async (tx: any) => {
        // At most one isDefault per product — reset any existing default
        // before creating this one, same tenantId scoping as everything
        // else in this handler.
        if (isDefault) {
          await tx.productBarcode.updateMany({
            where: { productId: id, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.productBarcode.create({
          data: {
            tenantId,
            productId: id,
            variantId: variantId ?? null,
            barcode,
            type,
            isDefault,
            unitQty: unitQty ?? null,
          },
        });
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return reply.status(409).send({ success: false, error: 'BARCODE_ALREADY_EXISTS' });
      }
      throw err;
    }

    return reply.status(201).send({ success: true, data: created });
  });

  fastify.delete('/products/:id/barcodes/:barcodeId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, barcodeId } = request.params as { id: string; barcodeId: string };
    const tenantId = request.tenantId!;

    const product = await prisma.product.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });

    // Tenant isolation via productId (already tenant-checked above) +
    // barcodeId together — a barcode that exists but belongs to a
    // different tenant's product is a 404, never a 403.
    const result = await prisma.productBarcode.deleteMany({ where: { id: barcodeId, productId: id } });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Barcode not found' });

    return { success: true, message: 'Barcode deleted' };
  });

  const stockAdjustSchema = z.object({
    qty: z.number().int(),
    variantId: z.string().optional(),
    mode: z.enum(['set', 'delta']).default('set'),
    note: z.string().max(255).optional(),
  });

  const stockMovementsQuerySchema = z.object({
    productId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  });

  // List stock movements
  fastify.get('/stock-movements', { preHandler: [permissionGuard('manageCatalog')] }, async (request) => {
    const { productId, limit } = stockMovementsQuerySchema.parse(request.query);
    const where: any = { tenantId: request.tenantId! };
    if (productId) where.productId = productId;
    const movements = await prisma.stockMovement.findMany({
      where,
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { success: true, data: movements };
  });

  // Adjust stock
  fastify.patch('/products/:id/stock', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let qty: number, variantId: string | undefined, mode: 'set' | 'delta', note: string | undefined;
    try {
      ({ qty, variantId, mode, note } = stockAdjustSchema.parse(request.body));
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    if (mode === 'set' && qty < 0) {
      return reply.status(400).send({ success: false, error: 'qty must be >= 0 in set mode' });
    }

    let qtyBefore: number;
    let qtyAfter: number;

    if (variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: variantId, productId: id, product: { tenantId: request.tenantId! } },
      });
      if (!variant) return reply.status(404).send({ success: false, error: 'Variant not found' });
      qtyBefore = variant.stockQty;
      qtyAfter = mode === 'delta' ? Math.max(0, qtyBefore + qty) : qty;
      await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: qtyAfter } });
    } else {
      const product = await prisma.product.findFirst({ where: { id, tenantId: request.tenantId!, deletedAt: null } });
      if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });
      qtyBefore = product.stockQty;
      qtyAfter = mode === 'delta' ? Math.max(0, qtyBefore + qty) : qty;
      await prisma.product.update({ where: { id }, data: { stockQty: qtyAfter } });
    }

    const delta = mode === 'delta' ? qty : qtyAfter - qtyBefore;
    await prisma.stockMovement.create({
      data: {
        tenantId: request.tenantId!,
        productId: id,
        variantId: variantId ?? null,
        delta,
        qtyBefore,
        qtyAfter,
        note: note ?? null,
        userId: request.user?.userId ?? null,
      },
    });

    return { success: true, data: { qtyBefore, qtyAfter, delta } };
  });

  // Product images
  fastify.post('/products/:id/images', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const product = await prisma.product.findFirst({
      where: { id, tenantId: request.tenantId!, deletedAt: null },
    });
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });

    // Fast pre-check before processing the file (avoids unnecessary upload work)
    const imageCountPre = await prisma.productImage.count({ where: { productId: id } });
    if (imageCountPre >= 10) {
      return reply.status(400).send({ success: false, error: 'Maximum 10 images per product' });
    }

    const file = await request.file();
    if (!file) return reply.status(400).send({ success: false, error: 'No file uploaded' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return reply.status(400).send({ success: false, error: 'Allowed types: JPEG, PNG, WebP, GIF' });
    }

    try {
      await ensureBucket();
      let buffer = await file.toBuffer();

      // Validate file size (5MB max)
      if (buffer.length > 5 * 1024 * 1024) {
        return reply.status(400).send({ success: false, error: 'Maximum file size is 5 MB' });
      }

      // Resize and compress with sharp (if available)
      try {
        const sharp = (await import('sharp')).default;
        const isAnimated = file.mimetype === 'image/gif' || file.mimetype === 'image/webp';
        const metadata = await sharp(buffer, { animated: isAnimated }).metadata();

        // Resize if wider than 1200px, compress to WebP
        let pipeline = sharp(buffer, { animated: isAnimated });
        if (metadata.width && metadata.width > 1200) {
          pipeline = pipeline.resize(1200, null, { withoutEnlargement: true });
        }
        buffer = await pipeline
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        // sharp is optional; if unavailable, upload original file
      }

      const fileName = buildProductImageObjectPath(request.tenantId!, id, `${crypto.randomUUID()}.webp`);
      const url = await uploadFile(fileName, buffer, 'image/webp');

      // Re-check the limit inside a transaction to prevent concurrent uploads
      // from exceeding 10 images per product.
      const image = await prisma.$transaction(async (tx: any) => {
        const imageCount = await tx.productImage.count({ where: { productId: id } });
        if (imageCount >= 10) throw new Error('LIMIT_EXCEEDED');
        return tx.productImage.create({ data: { productId: id, url, sortOrder: imageCount } });
      });

      return { success: true, data: image };
    } catch (err: any) {
      if (err?.message === 'LIMIT_EXCEEDED') {
        return reply.status(400).send({ success: false, error: 'Maximum 10 images per product' });
      }
      return reply.status(500).send({ success: false, error: 'Upload failed' });
    }
  });

  fastify.delete('/products/:id/images/:imageId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, imageId } = request.params as { id: string; imageId: string };

    const product = await prisma.product.findFirst({
      where: { id, tenantId: request.tenantId! },
    });
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });

    // Get image URL before deleting
    const image = await prisma.productImage.findFirst({
      where: { id: imageId, productId: id },
    });
    if (!image) return reply.status(404).send({ success: false, error: 'Image not found' });

    // Delete from S3
    try {
      const { getS3 } = await import('../../lib/s3.js');
      const s3Path = image.url.replace(/^\/uploads\//, '');
      const { bucket, objectPath } = resolveBucketAndObjectPath(s3Path);
      await getS3().removeObject(bucket, objectPath);
    } catch {
      // S3 cleanup best-effort
    }

    await prisma.productImage.delete({ where: { id: imageId } });
    return { success: true, message: 'Image deleted' };
  });
}
