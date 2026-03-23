import type { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';

async function resolveApiKey(authHeader: string | undefined): Promise<{ tenantId: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const raw = authHeader.slice(7).trim();
  if (!raw) return null;
  const keyHash = createHash('sha256').update(raw).digest('hex');
  const key = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, tenantId: true, isActive: true, expiresAt: true },
  });
  if (!key || !key.isActive) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  // Update lastUsedAt without blocking the response
  void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { tenantId: key.tenantId };
}

export default async function publicApiRoutes(fastify: FastifyInstance) {
  // Prehandler — all /v1/* routes require valid API key
  fastify.addHook('preHandler', async (request, reply) => {
    const ctx = await resolveApiKey(request.headers.authorization);
    if (!ctx) {
      return reply.status(401).send({ success: false, error: 'Invalid or missing API key' });
    }
    (request as any).apiTenantId = ctx.tenantId;
  });

  // ── Products ──────────────────────────────────────────────

  fastify.get('/v1/products', async (request) => {
    const tenantId = (request as any).apiTenantId as string;
    const qs = request.query as any;
    const page = Math.max(1, parseInt(qs.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(qs.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = { tenantId, isArchived: false };
    if (qs.categoryId) where.categoryId = qs.categoryId;
    if (qs.search) {
      where.OR = [
        { name: { contains: qs.search, mode: 'insensitive' } },
        { sku: { contains: qs.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          sku: true,
          description: true,
          price: true,
          comparePrice: true,
          qty: true,
          isVisible: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
          images: true,
          variants: {
            select: { id: true, name: true, price: true, qty: true, sku: true },
          },
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return { success: true, data: { items, total, page, limit, pages: Math.ceil(total / limit) } };
  });

  fastify.get('/v1/products/:id', async (request, reply) => {
    const tenantId = (request as any).apiTenantId as string;
    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, tenantId, isArchived: false },
      include: {
        category: { select: { id: true, name: true } },
        variants: { select: { id: true, name: true, price: true, qty: true, sku: true } },
      },
    });
    if (!product) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: product };
  });

  // ── Orders ────────────────────────────────────────────────

  fastify.get('/v1/orders', async (request) => {
    const tenantId = (request as any).apiTenantId as string;
    const qs = request.query as any;
    const page = Math.max(1, parseInt(qs.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(qs.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (qs.status) where.status = qs.status;
    if (qs.from || qs.to) {
      where.createdAt = {};
      if (qs.from) where.createdAt.gte = new Date(qs.from);
      if (qs.to) where.createdAt.lte = new Date(qs.to);
    }

    const [total, items] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          subtotal: true,
          deliveryPrice: true,
          paymentMethod: true,
          paymentStatus: true,
          customerName: true,
          customerPhone: true,
          deliveryAddress: true,
          note: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              name: true,
              price: true,
              qty: true,
            },
          },
        },
      }),
    ]);

    return { success: true, data: { items, total, page, limit, pages: Math.ceil(total / limit) } };
  });

  fastify.get('/v1/orders/:id', async (request, reply) => {
    const tenantId = (request as any).apiTenantId as string;
    const { id } = request.params as { id: string };
    const order = await prisma.order.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          select: { id: true, productId: true, variantId: true, name: true, price: true, qty: true },
        },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });
    if (!order) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, data: order };
  });

  const patchOrderSchema = z.object({
    status: z.enum([
      'NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED',
      'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED',
    ]),
  });

  fastify.patch('/v1/orders/:id/status', async (request, reply) => {
    const tenantId = (request as any).apiTenantId as string;
    const { id } = request.params as { id: string };
    const body = patchOrderSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid status' });

    const existing = await prisma.order.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ success: false, error: 'Not found' });

    const updated = await prisma.order.update({
      where: { id },
      data: { status: body.data.status },
      select: { id: true, orderNumber: true, status: true, updatedAt: true },
    });
    return { success: true, data: updated };
  });
}
