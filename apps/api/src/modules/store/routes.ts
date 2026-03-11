import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { encrypt } from '../../lib/encrypt.js';
import { planGuard } from '../../plugins/plan-guard.js';

const createStoreSchema = z.object({
  name: z.string().min(1),
  botToken: z.string().min(10),
  welcomeMessage: z.string().optional(),
});

const updateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  botToken: z.string().min(10).optional(),
  welcomeMessage: z.string().optional(),
  miniAppUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

const createPaymentMethodSchema = z.object({
  provider: z.enum(['CASH', 'MANUAL_TRANSFER', 'CLICK', 'PAYME', 'UZUM', 'STRIPE', 'CUSTOM']).default('CUSTOM'),
  code: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/i),
  title: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  instructions: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().default(0),
  meta: z.record(z.any()).optional(),
});

const updatePaymentMethodSchema = createPaymentMethodSchema.partial().extend({
  isActive: z.boolean().optional(),
});

async function ensureStoreForTenant(storeId: string, tenantId: string) {
  return prisma.store.findFirst({ where: { id: storeId, tenantId } });
}

export default async function storeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/stores', async (request) => {
    const stores = await prisma.store.findMany({
      where: { tenantId: request.tenantId! },
      select: {
        id: true,
        name: true,
        botUsername: true,
        isActive: true,
        miniAppUrl: true,
        createdAt: true,
        _count: { select: { paymentMethods: { where: { isActive: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: stores };
  });

  fastify.post('/stores', {
    preHandler: [planGuard('maxStores')],
  }, async (request, reply) => {
    try {
      const body = createStoreSchema.parse(request.body);
      const encryptedToken = encrypt(body.botToken);

      const store = await prisma.store.create({
        data: {
          tenantId: request.tenantId!,
          name: body.name,
          botToken: encryptedToken,
          welcomeMessage: body.welcomeMessage,
          paymentMethods: {
            create: {
              tenantId: request.tenantId!,
              provider: 'CASH',
              code: 'cash_on_delivery',
              title: 'Наличными при получении',
              description: 'Оплата при выдаче заказа',
              isDefault: true,
            },
          },
        },
      });

      return { success: true, data: store };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/stores/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const store = await prisma.store.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: {
        deliveryZones: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        paymentMethods: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] },
      },
    });
    if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });
    return { success: true, data: { ...store, botToken: '***' } };
  });

  fastify.patch('/stores/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateStoreSchema.parse(request.body);

    const data: any = { ...body };
    if (body.botToken) {
      data.botToken = encrypt(body.botToken);
    }

    const store = await prisma.store.updateMany({
      where: { id, tenantId: request.tenantId! },
      data,
    });
    if (store.count === 0) return reply.status(404).send({ success: false, error: 'Store not found' });
    return { success: true, message: 'Store updated' };
  });

  fastify.post('/stores/:id/activate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const store = await prisma.store.findFirst({ where: { id, tenantId: request.tenantId! } });
    if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

    return { success: true, message: 'Bot activation requested', storeId: store.id, webhookSecret: store.webhookSecret };
  });

  fastify.get('/stores/:id/payment-methods', async (request, reply) => {
    const { id } = request.params as { id: string };
    const store = await ensureStoreForTenant(id, request.tenantId!);
    if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

    const methods = await prisma.storePaymentMethod.findMany({
      where: { storeId: id, tenantId: request.tenantId! },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return { success: true, data: methods };
  });

  fastify.post('/stores/:id/payment-methods', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createPaymentMethodSchema.parse(request.body);

    const store = await ensureStoreForTenant(id, request.tenantId!);
    if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

    if (body.isDefault) {
      await prisma.storePaymentMethod.updateMany({
        where: { storeId: id, tenantId: request.tenantId! },
        data: { isDefault: false },
      });
    }

    try {
      const method = await prisma.storePaymentMethod.create({
        data: {
          tenantId: request.tenantId!,
          storeId: id,
          ...body,
          isDefault: body.isDefault ?? false,
        },
      });
      return { success: true, data: method };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/stores/:id/payment-methods/:methodId', async (request, reply) => {
    const { id, methodId } = request.params as { id: string; methodId: string };
    const body = updatePaymentMethodSchema.parse(request.body);

    const method = await prisma.storePaymentMethod.findFirst({
      where: { id: methodId, storeId: id, tenantId: request.tenantId! },
    });
    if (!method) return reply.status(404).send({ success: false, error: 'Payment method not found' });

    if (body.isDefault) {
      await prisma.storePaymentMethod.updateMany({
        where: { storeId: id, tenantId: request.tenantId! },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.storePaymentMethod.update({
      where: { id: methodId },
      data: body as any,
    });

    return { success: true, data: updated };
  });

  fastify.delete('/stores/:id/payment-methods/:methodId', async (request, reply) => {
    const { id, methodId } = request.params as { id: string; methodId: string };

    const method = await prisma.storePaymentMethod.findFirst({
      where: { id: methodId, storeId: id, tenantId: request.tenantId! },
    });
    if (!method) return reply.status(404).send({ success: false, error: 'Payment method not found' });

    await prisma.storePaymentMethod.update({
      where: { id: methodId },
      data: { isActive: false, isDefault: false },
    });

    const hasDefault = await prisma.storePaymentMethod.findFirst({
      where: { storeId: id, tenantId: request.tenantId!, isActive: true, isDefault: true },
    });

    if (!hasDefault) {
      const fallback = await prisma.storePaymentMethod.findFirst({
        where: { storeId: id, tenantId: request.tenantId!, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (fallback) {
        await prisma.storePaymentMethod.update({ where: { id: fallback.id }, data: { isDefault: true } });
      }
    }

    return { success: true, message: 'Payment method archived' };
  });
}
