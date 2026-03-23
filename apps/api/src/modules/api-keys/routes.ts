import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';

export default async function apiKeyAdminRoutes(fastify: FastifyInstance) {
  // List API keys for tenant
  fastify.get('/api-keys', async (request) => {
    const tenantId = (request as any).user?.tenantId as string;
    const keys = await prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return { success: true, data: keys };
  });

  const createSchema = z.object({
    name: z.string().min(1).max(100),
    expiresAt: z.string().datetime().optional(),
  });

  // Create new API key — returns the raw key ONCE
  fastify.post('/api-keys', async (request, reply) => {
    const tenantId = (request as any).user?.tenantId as string;
    const body = createSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid input' });

    const raw = 'sg_' + randomBytes(32).toString('hex');
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 10); // "sg_XXXXXXX"

    const key = await prisma.apiKey.create({
      data: {
        tenantId,
        name: body.data.name,
        keyHash,
        prefix,
        expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null,
      },
      select: { id: true, name: true, prefix: true, isActive: true, expiresAt: true, createdAt: true },
    });

    return reply.status(201).send({ success: true, data: { ...key, key: raw } });
  });

  // Revoke (delete) API key
  fastify.delete('/api-keys/:id', async (request, reply) => {
    const tenantId = (request as any).user?.tenantId as string;
    const { id } = request.params as { id: string };
    const existing = await prisma.apiKey.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ success: false, error: 'Not found' });
    await prisma.apiKey.delete({ where: { id } });
    return { success: true, data: { ok: true } };
  });
}
