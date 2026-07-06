import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

/**
 * Store-admin CRUD for the B2B/counterparties module
 * (docs/B2B_COUNTERPARTIES.md §13 step 4). Every endpoint here requires
 * manageB2B — including reads, since counterparty pricing/debt is
 * commercially sensitive data, unlike e.g. the product catalog.
 *
 * Deliberately NOT gated on Tenant.b2bEnabled: that field only controls
 * UI visibility (docs/B2B_COUNTERPARTIES.md §9) — a tenant that hasn't
 * "turned on" B2B in the UI can still use this API directly.
 *
 * Does not touch CounterpartyLedger (debt/payment recording — §13 step 6)
 * or B2B order creation (§13 step 5).
 */

const listCounterpartiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  type: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

// taxId is required for ORGANIZATION (docs/B2B_COUNTERPARTIES.md §5.1) —
// an application-level rule, not a DB constraint (Prisma can't express
// "required iff type=X").
const createCounterpartySchema = z
  .object({
    type: z.enum(['INDIVIDUAL', 'ORGANIZATION']),
    name: z.string().min(1).max(200),
    taxId: z.string().min(1).max(50).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().max(500).optional(),
    note: z.string().max(2000).optional(),
    // Non-empty when provided — there's nothing to "unlink" on creation.
    supplierId: z.string().min(1).optional(),
  })
  .refine((data) => data.type !== 'ORGANIZATION' || !!data.taxId, {
    message: 'taxId is required for ORGANIZATION counterparties',
    path: ['taxId'],
  });

// Partial — every field optional, null explicitly means "clear this
// field" (matters for supplierId: null = unlink, string = link, absent =
// don't touch). taxId/type combination is validated against the *merged*
// existing+patch state in the handler, since a partial schema alone can't
// see the existing row.
const updateCounterpartySchema = z.object({
  type: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
  name: z.string().min(1).max(200).optional(),
  taxId: z.string().min(1).max(50).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  supplierId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

const upsertPriceSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  price: z.number().positive(),
});

export default async function counterpartyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/counterparties', { preHandler: [permissionGuard('manageB2B')] }, async (request, reply) => {
    const parsed = listCounterpartiesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const { page, pageSize, search, type, isActive } = parsed.data;
    const skip = (page - 1) * pageSize;

    const where: any = { tenantId: request.tenantId! };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { taxId: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [items, total] = await Promise.all([
      prisma.counterparty.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.counterparty.count({ where }),
    ]);

    return {
      success: true,
      data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  });

  fastify.post('/counterparties', { preHandler: [permissionGuard('manageB2B')] }, async (request, reply) => {
    const parsed = createCounterpartySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const tenantId = request.tenantId!;
    const { supplierId, ...rest } = parsed.data;

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } });
      if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' });

      const existingLink = await prisma.counterparty.findFirst({ where: { supplierId }, select: { id: true } });
      if (existingLink) {
        return reply.status(409).send({ success: false, error: 'Supplier is already linked to another counterparty' });
      }
    }

    let counterparty;
    try {
      counterparty = await prisma.counterparty.create({
        data: { tenantId, supplierId: supplierId ?? null, ...rest },
      });
    } catch (err: any) {
      // Race-condition backstop for the pre-check above (Counterparty.supplierId's
      // @unique is the real guarantee).
      if (err?.code === 'P2002') {
        return reply.status(409).send({ success: false, error: 'Supplier is already linked to another counterparty' });
      }
      throw err;
    }

    return reply.status(201).send({ success: true, data: counterparty });
  });

  fastify.get('/counterparties/:id', { preHandler: [permissionGuard('manageB2B')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const counterparty = await prisma.counterparty.findFirst({ where: { id, tenantId: request.tenantId! } });
    if (!counterparty) return reply.status(404).send({ success: false, error: 'Counterparty not found' });
    return { success: true, data: counterparty };
  });

  fastify.patch('/counterparties/:id', { preHandler: [permissionGuard('manageB2B')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateCounterpartySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const tenantId = request.tenantId!;

    const existing = await prisma.counterparty.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ success: false, error: 'Counterparty not found' });

    const { supplierId, ...rest } = parsed.data;

    // Validate against the merged existing+patch state — a partial schema
    // alone can't see whether the *effective* result is an ORGANIZATION
    // without a taxId.
    const effectiveType = rest.type ?? existing.type;
    const effectiveTaxId = rest.taxId !== undefined ? rest.taxId : existing.taxId;
    if (effectiveType === 'ORGANIZATION' && !effectiveTaxId) {
      return reply.status(400).send({ success: false, error: 'taxId is required for ORGANIZATION counterparties' });
    }

    if (supplierId !== undefined && supplierId !== null && supplierId !== existing.supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } });
      if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' });

      const existingLink = await prisma.counterparty.findFirst({
        where: { supplierId, id: { not: id } },
        select: { id: true },
      });
      if (existingLink) {
        return reply.status(409).send({ success: false, error: 'Supplier is already linked to another counterparty' });
      }
    }

    // currentDebt is deliberately absent from updateCounterpartySchema —
    // it is never settable directly, only via CounterpartyLedger (§13
    // step 6).
    const data: any = { ...rest };
    if (supplierId !== undefined) data.supplierId = supplierId;

    let updated;
    try {
      updated = await prisma.counterparty.update({ where: { id }, data });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return reply.status(409).send({ success: false, error: 'Supplier is already linked to another counterparty' });
      }
      throw err;
    }

    return { success: true, data: updated };
  });

  fastify.get('/counterparties/:id/prices', { preHandler: [permissionGuard('manageB2B')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const counterparty = await prisma.counterparty.findFirst({
      where: { id, tenantId: request.tenantId! },
      select: { id: true },
    });
    if (!counterparty) return reply.status(404).send({ success: false, error: 'Counterparty not found' });

    const prices = await prisma.counterpartyPrice.findMany({
      where: { counterpartyId: id },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        variant: { select: { id: true, name: true, sku: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: prices };
  });

  // Upsert on (counterpartyId, productId, variantId). There is no plain
  // @@unique covering this triple (docs/B2B_COUNTERPARTIES.md §5.2/§12.3 —
  // Postgres treats NULL != NULL, so two partial unique indexes enforce it
  // instead, see the migration). prisma.upsert() requires a @@unique/@id
  // to target, which doesn't exist here, so the upsert is done by hand:
  // find the exact tuple, then create or update inside a transaction so
  // the find+write pair is atomic against a second identical request.
  fastify.put(
    '/counterparties/:id/prices',
    { preHandler: [permissionGuard('manageB2B')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.tenantId!;
      const parsed = upsertPriceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }
      const { productId, price } = parsed.data;
      const variantId = parsed.data.variantId ?? null;

      const counterparty = await prisma.counterparty.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!counterparty) return reply.status(404).send({ success: false, error: 'Counterparty not found' });

      const product = await prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } });
      if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });

      if (variantId) {
        const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId }, select: { id: true } });
        if (!variant) return reply.status(404).send({ success: false, error: 'Variant not found for this product' });
      }

      const upsert = () =>
        prisma.$transaction(async (tx) => {
          const existing = await tx.counterpartyPrice.findFirst({
            where: { counterpartyId: id, productId, variantId },
            select: { id: true },
          });
          if (existing) {
            return tx.counterpartyPrice.update({ where: { id: existing.id }, data: { price } });
          }
          return tx.counterpartyPrice.create({
            data: { counterpartyId: id, productId, variantId, price },
          });
        });

      let result;
      try {
        result = await upsert();
      } catch (err: any) {
        // Lost a race against a concurrent identical upsert — one of the
        // two partial unique indexes caught it. Retry as a plain update;
        // if that also 404s (extremely unlikely — implies the row was
        // deleted between the retry and now) surface the original error.
        if (err?.code === 'P2002') {
          const winner = await prisma.counterpartyPrice.findFirst({
            where: { counterpartyId: id, productId, variantId },
            select: { id: true },
          });
          if (!winner) throw err;
          try {
            result = await prisma.counterpartyPrice.update({ where: { id: winner.id }, data: { price } });
          } catch (retryErr: any) {
            // The winner row was deleted between the findFirst above and
            // this update (e.g. a concurrent DELETE .../prices/:priceId) —
            // surface the original P2002, not this P2025.
            if (retryErr?.code === 'P2025') throw err;
            throw retryErr;
          }
        } else {
          throw err;
        }
      }

      return reply.status(200).send({ success: true, data: result });
    }
  );

  fastify.delete(
    '/counterparties/:id/prices/:priceId',
    { preHandler: [permissionGuard('manageB2B')] },
    async (request, reply) => {
      const { id, priceId } = request.params as { id: string; priceId: string };
      const tenantId = request.tenantId!;

      const counterparty = await prisma.counterparty.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!counterparty) return reply.status(404).send({ success: false, error: 'Counterparty not found' });

      const result = await prisma.counterpartyPrice.deleteMany({ where: { id: priceId, counterpartyId: id } });
      if (result.count === 0) return reply.status(404).send({ success: false, error: 'Price not found' });

      return { success: true };
    }
  );
}
