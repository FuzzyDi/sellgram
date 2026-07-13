import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { verifySystemToken } from '../../lib/system-jwt.js';
import prisma from '../../lib/prisma.js';

// Same protection as every other route in ./routes.ts (verifySystemToken +
// Bearer header) — duplicated here rather than imported to avoid a
// circular import between this file and routes.ts, which registers it.
// Same pattern as policy-routes.ts's own authenticateSystem.
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

const WEIGHT_MODES = ['PIECE', 'WEIGHT', 'PIECE_WEIGHT'] as const;

const ruleSchema = z.object({
  ruleId: z.string().min(1),
  severity: z.enum(['BLOCK', 'WARN']),
  channels: z.array(z.enum(['POS', 'TELEGRAM'])),
  params: z.record(z.unknown()).optional(),
});

const createProductTypeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  parentTypeId: z.string().nullable().optional(),
  weightMode: z.enum(WEIGHT_MODES).default('PIECE'),
  barcodePrefixes: z.array(z.string()).default([]),
  markType: z.string().nullable().optional(),
  rules: z.array(ruleSchema).default([]),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// Deliberately narrower than create — an isSystem row's identity
// (code/parentTypeId/weightMode/barcodePrefixes/markType/isSystem
// itself) is not editable through this endpoint at all, system or not
// (§ "PATCH ... нельзя менять isSystem=true типы через этот endpoint —
// только enabled/name/description/rules/sortOrder" — read as: these
// five fields are the only ones this endpoint ever accepts, for any
// row, system or tenant-created; identity fields are create-only).
const updateProductTypeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  rules: z.array(ruleSchema).optional(),
  sortOrder: z.number().int().optional(),
});

const idParamSchema = z.object({ id: z.string().min(1) });

export default async function productTypeRoutes(fastify: FastifyInstance) {
  fastify.get('/product-types', { preHandler: [authenticateSystem] }, async () => {
    const data = await prisma.productType.findMany({ orderBy: { sortOrder: 'asc' } });
    return { success: true, data };
  });

  fastify.post('/product-types', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const body = createProductTypeSchema.parse(request.body);
      const data = await prisma.productType.create({
        data: {
          code: body.code,
          name: body.name,
          description: body.description,
          parentTypeId: body.parentTypeId ?? null,
          weightMode: body.weightMode,
          barcodePrefixes: body.barcodePrefixes,
          markType: body.markType ?? null,
          rules: body.rules as any,
          enabled: body.enabled,
          sortOrder: body.sortOrder,
          // isSystem is never accepted from the request body — every
          // type created through this endpoint is a platform-managed,
          // non-system row. Only the seed script (packages/prisma/
          // seed-product-types.ts) ever writes isSystem: true.
          isSystem: false,
        },
      });
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/product-types/:id', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = idParamSchema.parse(request.params);
      const patch = updateProductTypeSchema.parse(request.body);
      const existing = await prisma.productType.findUnique({ where: { id } });
      if (!existing) return reply.status(404).send({ success: false, error: 'Product type not found' });

      const data = await prisma.productType.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.rules !== undefined ? { rules: patch.rules as any } : {}),
          ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        },
      });
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.delete('/product-types/:id', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = idParamSchema.parse(request.params);
      const existing = await prisma.productType.findUnique({ where: { id } });
      if (!existing) return reply.status(404).send({ success: false, error: 'Product type not found' });
      if (existing.isSystem) {
        return reply.status(400).send({ success: false, error: 'System product types cannot be deleted' });
      }
      await prisma.productType.delete({ where: { id } });
      return { success: true, data: { id } };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
}
