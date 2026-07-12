import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { verifySystemToken } from '../../lib/system-jwt.js';
import prisma from '../../lib/prisma.js';

// Same protection as every other route in ./routes.ts (verifySystemToken +
// Bearer header) — duplicated here rather than imported to avoid a
// circular import between this file and routes.ts, which registers it.
async function authenticateSystem(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
  try {
    const token = authHeader.slice(7);
    request.systemAdmin = await verifySystemToken(token);
  } catch {
    return reply.status(401).send({ success: false, error: 'Invalid system token' });
  }
}

const POLICY_SCOPES = ['SALE', 'REFUND', 'SHIFT', 'PAYMENT', 'MARKING', 'DISCOUNT', 'CASHIER', 'PRINT'] as const;
const POLICY_SEVERITIES = ['BLOCK', 'WARN', 'REQUIRE_MANAGER', 'REQUIRE_ACTION', 'INFO'] as const;

const policyMessageSchema = z.object({
  ru: z.string().min(1),
  uz: z.string().min(1),
});

const createPolicySchema = z.object({
  scope: z.enum(POLICY_SCOPES),
  severity: z.enum(POLICY_SEVERITIES),
  enabled: z.boolean().default(true),
  match: z.record(z.unknown()),
  message: policyMessageSchema,
  extra: z.record(z.unknown()).optional(),
});

const updatePolicySchema = z.object({
  scope: z.enum(POLICY_SCOPES).optional(),
  severity: z.enum(POLICY_SEVERITIES).optional(),
  enabled: z.boolean().optional(),
  match: z.record(z.unknown()).optional(),
  message: policyMessageSchema.optional(),
  extra: z.record(z.unknown()).optional().nullable(),
});

const idParamSchema = z.object({ id: z.string().min(1) });

// Same singleton-counter upsert pattern as seed-platform-policies.ts —
// find-then-create/update rather than a Prisma `upsert`, since
// PlatformPolicyVersion has no natural unique key to upsert against.
// Run inside the caller's transaction so the row mutation and the version
// bump land atomically.
async function bumpPlatformPolicyVersion(tx: Prisma.TransactionClient) {
  const row = await tx.platformPolicyVersion.findFirst();
  if (row) {
    await tx.platformPolicyVersion.update({ where: { id: row.id }, data: { version: { increment: 1 } } });
  } else {
    await tx.platformPolicyVersion.create({ data: { version: 1 } });
  }
}

export default async function policyRoutes(fastify: FastifyInstance) {
  fastify.get('/platform-policies', { preHandler: [authenticateSystem] }, async () => {
    const data = await prisma.platformPolicy.findMany({ orderBy: { createdAt: 'desc' } });
    return { success: true, data };
  });

  fastify.get('/platform-policies/version', { preHandler: [authenticateSystem] }, async () => {
    const row = await prisma.platformPolicyVersion.findFirst();
    return { success: true, data: { version: row?.version ?? 1 } };
  });

  fastify.post('/platform-policies', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const body = createPolicySchema.parse(request.body);
      const data = await prisma.$transaction(async (tx) => {
        const created = await tx.platformPolicy.create({
          data: {
            scope: body.scope,
            severity: body.severity,
            enabled: body.enabled,
            match: body.match as Prisma.InputJsonValue,
            message: body.message as Prisma.InputJsonValue,
            extra: body.extra as Prisma.InputJsonValue | undefined,
          },
        });
        await bumpPlatformPolicyVersion(tx);
        return created;
      });
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/platform-policies/:id', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = idParamSchema.parse(request.params);
      const patch = updatePolicySchema.parse(request.body);
      const existing = await prisma.platformPolicy.findUnique({ where: { id } });
      if (!existing) return reply.status(404).send({ success: false, error: 'Policy not found' });
      const data = await prisma.$transaction(async (tx) => {
        const updated = await tx.platformPolicy.update({
          where: { id },
          data: {
            ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
            ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
            ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
            ...(patch.match !== undefined ? { match: patch.match as Prisma.InputJsonValue } : {}),
            ...(patch.message !== undefined ? { message: patch.message as Prisma.InputJsonValue } : {}),
            ...(patch.extra !== undefined
              ? { extra: (patch.extra === null ? Prisma.JsonNull : patch.extra) as Prisma.InputJsonValue }
              : {}),
          },
        });
        await bumpPlatformPolicyVersion(tx);
        return updated;
      });
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.delete('/platform-policies/:id', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = idParamSchema.parse(request.params);
      const existing = await prisma.platformPolicy.findUnique({ where: { id } });
      if (!existing) return reply.status(404).send({ success: false, error: 'Policy not found' });
      await prisma.$transaction(async (tx) => {
        await tx.platformPolicy.delete({ where: { id } });
        await bumpPlatformPolicyVersion(tx);
      });
      return { success: true, data: { ok: true } };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
}
