import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';

const ALLOWED_EVENTS = ['order.created', 'order.status_changed', 'order.paid', 'customer.created', '*'] as const;

const createSchema = z.object({
  url: z.string().url().max(500),
  events: z.array(z.enum(ALLOWED_EVENTS)).min(1),
});

const updateSchema = z.object({
  url: z.string().url().max(500).optional(),
  events: z.array(z.enum(ALLOWED_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export default async function webhookAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/webhooks', async (request) => {
    const tenantId = request.tenantId!;
    const hooks = await prisma.webhook.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, events: true, isActive: true, createdAt: true },
    });
    return { success: true, data: hooks };
  });

  fastify.post('/webhooks', async (request, reply) => {
    const tenantId = request.tenantId!;
    const body = createSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid input' });

    const secret = 'whsec_' + randomBytes(32).toString('hex');
    const hook = await prisma.webhook.create({
      data: { tenantId, url: body.data.url, events: body.data.events, secret },
      select: { id: true, url: true, events: true, isActive: true, createdAt: true, secret: true },
    });
    return reply.status(201).send({ success: true, data: hook });
  });

  fastify.patch('/webhooks/:id', async (request, reply) => {
    const tenantId = request.tenantId!;
    const { id } = request.params as { id: string };
    const body = updateSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid input' });

    const existing = await prisma.webhook.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ success: false, error: 'Not found' });

    const hook = await prisma.webhook.update({
      where: { id },
      data: body.data,
      select: { id: true, url: true, events: true, isActive: true, createdAt: true },
    });
    return { success: true, data: hook };
  });

  fastify.delete('/webhooks/:id', async (request, reply) => {
    const tenantId = request.tenantId!;
    const { id } = request.params as { id: string };
    const existing = await prisma.webhook.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ success: false, error: 'Not found' });
    await prisma.webhook.delete({ where: { id } });
    return { success: true, data: { ok: true } };
  });
}
