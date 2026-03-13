import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { uploadFile, ensureBucket, resolveBucketAndObjectPath, buildProductImageObjectPath } from '../../lib/s3.js';
import crypto from 'node:crypto';

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
  fastify.get('/products', async (request) => {
    const { page = 1, pageSize = 20, search, categoryId, active } = request.query as any;
    const skip = (Number(page) - 1) * Number(pageSize);

    const where: any = { tenantId: request.tenantId! };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (categoryId) where.categoryId = categoryId;
    if (active !== undefined) where.isActive = active === 'true';

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
        take: Number(pageSize),
      }),
      prisma.product.count({ where }),
    ]);

    return {
      success: true,
      data: { items, total, page: Number(page), pageSize: Number(pageSize), totalPages: Math.ceil(total / Number(pageSize)) },
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

  // Adjust stock
  fastify.patch('/products/:id/stock', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { qty, variantId } = request.body as { qty: number; variantId?: string };

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

    // Max 10 images per product
    const imageCount = await prisma.productImage.count({ where: { productId: id } });
    if (imageCount >= 10) {
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

      const image = await prisma.productImage.create({
        data: { productId: id, url, sortOrder: imageCount },
      });

      return { success: true, data: image };
    } catch (err: any) {
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
    } catch { /* S3 cleanup best-effort */ }

    await prisma.productImage.delete({ where: { id: imageId } });
    return { success: true, message: 'Image deleted' };
  });
}

