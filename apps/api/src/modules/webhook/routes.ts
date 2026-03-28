import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';

const ALLOWED_EVENTS = ['order.created', 'order.status_changed', 'order.paid', 'customer.created', '*'] as const;

// Block SSRF: reject URLs that resolve to private/internal network addresses.
// Covers localhost, loopback, RFC-1918 ranges, Docker service names, and cloud metadata IPs.
const BLOCKED_HOSTNAMES = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|redis|postgres|minio|api|admin|miniapp|nginx)$/i;
const PRIVATE_IP = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;

function isSafeWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.test(host)) return false;
    if (PRIVATE_IP.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

const webhookUrlSchema = z.string().url().max(500).refine(isSafeWebhookUrl, {
  message: 'URL must be a public HTTPS address',
});

const createSchema = z.object({
  url: webhookUrlSchema,
  events: z.array(z.enum(ALLOWED_EVENTS)).min(1),
});

const updateSchema = z.object({
  url: webhookUrlSchema.optional(),
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

  fastify.post('/webhooks', { preHandler: planGuard('webhooksEnabled') }, async (request, reply) => {
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
