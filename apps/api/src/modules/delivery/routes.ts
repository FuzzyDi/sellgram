import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';

const zoneSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  price: z.number().min(0),
  freeFrom: z.number().positive().nullable().optional(),
  etaMin: z.number().int().positive().optional(),
  etaMax: z.number().int().positive().optional(),
  sortOrder: z.number().int().default(0),
});

export default async function deliveryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/delivery-zones', async (request) => {
    const { storeId } = request.query as any;
    const where: any = { tenantId: request.tenantId! };
    if (storeId) where.storeId = storeId;

    const zones = await prisma.deliveryZone.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: zones };
  });

  fastify.post('/delivery-zones', {
    preHandler: [planGuard('maxDeliveryZones')],
  }, async (request, reply) => {
    try {
      const body = zoneSchema.parse(request.body);
      const store = await prisma.store.findFirst({
        where: { id: body.storeId, tenantId: request.tenantId!, isActive: true },
      });
      if (!store) {
        return reply.status(400).send({ success: false, error: 'Invalid store for tenant' });
      }
      const zone = await prisma.deliveryZone.create({
        data: { tenantId: request.tenantId!, ...body },
      });
      return { success: true, data: zone };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/delivery-zones/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = zoneSchema.partial().parse(request.body);
    if (body.storeId) {
      const store = await prisma.store.findFirst({
        where: { id: body.storeId, tenantId: request.tenantId!, isActive: true },
      });
      if (!store) {
        return reply.status(400).send({ success: false, error: 'Invalid store for tenant' });
      }
    }
    const result = await prisma.deliveryZone.updateMany({
      where: { id, tenantId: request.tenantId! },
      data: body as any,
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, message: 'Zone updated' };
  });

  fastify.delete('/delivery-zones/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.deliveryZone.updateMany({
      where: { id, tenantId: request.tenantId! },
      data: { isActive: false },
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, message: 'Zone deleted' };
  });
}
