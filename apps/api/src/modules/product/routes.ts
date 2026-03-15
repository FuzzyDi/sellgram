import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { uploadFile, ensureBucket, resolveBucketAndObjectPath, buildProductImageObjectPath } from '../../lib/s3.js';
import crypto from 'node:crypto';

const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  categoryId: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
});

const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  price: z.number().positive(),
  costPrice: z.number().positive().optional(),
  sku: z.string().optional(),
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
  price: z.number().positive().optional(),
  costPrice: z.number().positive().nullable().optional(),
  sku: z.string().nullable().optional(),
  stockQty: z.number().int().min(0).optional(),
  lowStockAlert: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export default async function productRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

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

    const where: any = { tenantId: request.tenantId! };
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
      where: { id, tenantId: request.tenantId! },
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
    preHandler: [planGuard('maxProducts')],
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
      const product = await prisma.product.create({
        data: {
          tenantId: request.tenantId!,
          name: body.name,
          description: body.description,
          categoryId: body.categoryId,
          price: body.price,
          costPrice: body.costPrice,
          sku: body.sku,
          stockQty: body.stockQty,
          lowStockAlert: body.lowStockAlert,
          variants: body.variants ? { create: body.variants } : undefined,
        },
        include: { variants: true, images: true },
      });
      return { success: true, data: product };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Update product
  fastify.patch('/products/:id', async (request, reply) => {
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
      const product = await prisma.product.updateMany({
        where: { id, tenantId: request.tenantId! },
        data: body as any,
      });
      if (product.count === 0) return reply.status(404).send({ success: false, error: 'Product not found' });
      return { success: true, message: 'Product updated' };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Delete (soft)
  fastify.delete('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.product.updateMany({
      where: { id, tenantId: request.tenantId! },
      data: { isActive: false },
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Product not found' });
    return { success: true, message: 'Product deactivated' };
  });

  const stockAdjustSchema = z.object({
    qty: z.number().int().min(0),
    variantId: z.string().optional(),
  });

  // Adjust stock
  fastify.patch('/products/:id/stock', async (request, reply) => {
    const { id } = request.params as { id: string };
    let qty: number;
    let variantId: string | undefined;
    try {
      ({ qty, variantId } = stockAdjustSchema.parse(request.body));
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    if (variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: {
          id: variantId,
          productId: id,
          product: { tenantId: request.tenantId! },
        },
      });
      if (!variant) return reply.status(404).send({ success: false, error: 'Variant not found' });
      await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: qty } });
    } else {
      const result = await prisma.product.updateMany({
        where: { id, tenantId: request.tenantId! },
        data: { stockQty: qty },
      });
      if (result.count === 0) return reply.status(404).send({ success: false, error: 'Product not found' });
    }
    return { success: true, message: 'Stock updated' };
  });

  // Product images
  fastify.post('/products/:id/images', async (request, reply) => {
    const { id } = request.params as { id: string };

    const product = await prisma.product.findFirst({
      where: { id, tenantId: request.tenantId! },
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
        const metadata = await sharp(buffer).metadata();

        // Resize if wider than 1200px, compress to WebP
        let pipeline = sharp(buffer);
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

  fastify.delete('/products/:id/images/:imageId', async (request, reply) => {
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
