import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/auth.js';
import { uploadFile, ensureBucket, buildBannerObjectPath, resolveBucketAndObjectPath, getS3 } from '../../lib/s3.js';

const createBannerSchema = z.object({
  title: z.string().max(120).optional(),
  linkUrl: z.string().url().max(500).optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

const updateBannerSchema = createBannerSchema.partial();

export default async function bannerRoutes(fastify: FastifyInstance) {
  // List banners
  fastify.get('/banners', async (request) => {
    const banners = await prisma.banner.findMany({
      where: { tenantId: request.tenantId! },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { success: true, data: banners };
  });

  // Upload image and create banner
  fastify.post('/banners', { preHandler: [permissionGuard('manageSettings')] }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ success: false, error: 'No file uploaded' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return reply.status(400).send({ success: false, error: 'Allowed types: JPEG, PNG, WebP, GIF' });
    }

    // Parse metadata fields from multipart
    let title: string | undefined;
    let linkUrl: string | undefined;
    let sortOrder = 0;
    let isActive = true;

    try {
      const fields = (file as any).fields as Record<string, any> | undefined;
      if (fields?.title?.value) title = String(fields.title.value).slice(0, 120);
      if (fields?.linkUrl?.value) linkUrl = String(fields.linkUrl.value).slice(0, 500);
      if (fields?.sortOrder?.value) sortOrder = parseInt(fields.sortOrder.value, 10) || 0;
      if (fields?.isActive?.value !== undefined) isActive = fields.isActive.value !== 'false';
    } catch {
      // ignore parse errors — use defaults
    }

    try {
      await ensureBucket();
      let buffer = await file.toBuffer();
      if (buffer.length > 5 * 1024 * 1024) {
        return reply.status(400).send({ success: false, error: 'Maximum file size is 5 MB' });
      }

      try {
        const sharp = (await import('sharp')).default;
        const metadata = await sharp(buffer).metadata();
        let pipeline = sharp(buffer);
        if (metadata.width && metadata.width > 1600) {
          pipeline = pipeline.resize(1600, null, { withoutEnlargement: true });
        }
        buffer = await pipeline.webp({ quality: 85 }).toBuffer();
      } catch {
        // sharp optional
      }

      const fileName = buildBannerObjectPath(request.tenantId!, `${crypto.randomUUID()}.webp`);
      const url = await uploadFile(buffer, fileName, 'image/webp');

      const banner = await prisma.banner.create({
        data: {
          tenantId: request.tenantId!,
          title: title || null,
          imageUrl: url,
          linkUrl: linkUrl || null,
          sortOrder,
          isActive,
        },
      });

      return { success: true, data: banner };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Update banner (metadata only)
  fastify.patch('/banners/:id', { preHandler: [permissionGuard('manageSettings')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let body: z.infer<typeof updateBannerSchema>;
    try {
      body = updateBannerSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const result = await prisma.banner.updateMany({
      where: { id, tenantId: request.tenantId! },
      data: body as any,
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Banner not found' });
    return { success: true, message: 'Banner updated' };
  });

  // Delete banner
  fastify.delete('/banners/:id', { preHandler: [permissionGuard('manageSettings')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const banner = await prisma.banner.findFirst({ where: { id, tenantId: request.tenantId! } });
    if (!banner) return reply.status(404).send({ success: false, error: 'Banner not found' });

    // Delete from S3
    try {
      const s3Path = banner.imageUrl.replace(/^\/uploads\//, '');
      const { bucket, objectPath } = resolveBucketAndObjectPath(s3Path);
      const s3 = getS3();
      await s3.removeObject(bucket, objectPath);
    } catch {
      // ignore S3 errors — still delete DB record
    }

    await prisma.banner.delete({ where: { id } });
    return { success: true, message: 'Banner deleted' };
  });
}
