import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export default async function auditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/audit-logs', async (request, reply) => {
    let query: z.infer<typeof querySchema>;
    try {
      query = querySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const logs = await prisma.tenantAuditLog.findMany({
      where: { tenantId: request.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    const actorIds = [...new Set(logs.map((l) => l.actorId).filter((id): id is string => !!id))];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, name: true },
        })
      : [];
    const actorMap = Object.fromEntries(actors.map((a) => [a.id, a]));

    const data = logs.map((l) => ({
      ...l,
      actor: l.actorId ? (actorMap[l.actorId] ?? null) : null,
    }));

    return { success: true, data };
  });
}
