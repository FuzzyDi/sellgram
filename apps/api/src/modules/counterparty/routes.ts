import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { createB2BOrder, CounterpartyOrderError } from './order.service.js';
import { writeAuditLog } from '../../lib/audit.js';

/**
 * Store-admin CRUD for the B2B/counterparties module
 * (docs/B2B_COUNTERPARTIES.md §13 step 4). Every endpoint here requires
 * manageB2B — including reads, since counterparty pricing/debt is
 * commercially sensitive data, unlike e.g. the product catalog.
 *
 * Deliberately NOT gated on Tenant.b2bEnabled: that field only controls
 * UI visibility (docs/B2B_COUNTERPARTIES.md §9) — a tenant that hasn't
 * "turned on" B2B in the UI can still use this API directly.
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

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(2000).optional(),
});

const listLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const extendDueDateSchema = z.object({
  newDueDate: z.string().min(1),
});

// note is required (unlike recordPaymentSchema's optional note) — a
// manual debt correction isn't self-explanatory the way a payment is, so
// it must always carry a reason.
const recordAdjustmentSchema = z.object({
  delta: z.number().refine((n) => n !== 0, { message: 'delta must not be zero' }),
  note: z.string().min(1).max(2000),
});

const createB2BOrderItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  qty: z.number().int().positive(),
});

// storeId is required — unlike the Telegram bot (which always knows its
// one store from the webhook it received), a manager creating a B2B order
// in the admin has to say which store's inventory/warehouse this draws
// from (docs/B2B_COUNTERPARTIES.md §13 step 5).
const createB2BOrderSchema = z.object({
  storeId: z.string().min(1),
  items: z.array(createB2BOrderItemSchema).min(1),
  // No DeliveryZone lookup here (unlike checkout.service.ts) — a B2B order
  // is entered manually by a manager who already knows the delivery
  // arrangement (often self-pickup), so deliveryPrice, if any, is typed in
  // directly rather than resolved from a zone.
  deliveryType: z.enum(['PICKUP', 'LOCAL', 'NATIONAL']).default('PICKUP'),
  deliveryAddress: z.string().max(500).optional(),
  deliveryPrice: z.number().min(0).optional(),
  note: z.string().max(2000).optional(),
  paymentTermDays: z.number().int().positive().max(365).optional(),
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

  // B2B order creation (docs/B2B_COUNTERPARTIES.md §13 step 5) — see
  // order.service.ts for the transaction (price resolution, stock
  // decrement, debt ledger).
  fastify.post(
    '/counterparties/:id/orders',
    { preHandler: [permissionGuard('manageB2B')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = createB2BOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }

      try {
        const order = await createB2BOrder({
          tenantId: request.tenantId!,
          storeId: parsed.data.storeId,
          counterpartyId: id,
          actorUserId: request.user?.userId,
          items: parsed.data.items,
          deliveryType: parsed.data.deliveryType,
          deliveryAddress: parsed.data.deliveryAddress,
          deliveryPrice: parsed.data.deliveryPrice,
          note: parsed.data.note,
          paymentTermDays: parsed.data.paymentTermDays,
        });
        return reply.status(201).send({ success: true, data: order });
      } catch (err: any) {
        if (err instanceof CounterpartyOrderError) {
          switch (err.code) {
            case 'COUNTERPARTY_NOT_FOUND':
              return reply.status(404).send({ success: false, error: 'Counterparty not found' });
            case 'STORE_NOT_FOUND':
              return reply.status(404).send({ success: false, error: 'Store not found' });
            case 'PRODUCT_NOT_FOUND':
              return reply.status(404).send({ success: false, error: `Product not found: ${err.detail}` });
            case 'VARIANT_NOT_FOUND':
              return reply.status(404).send({ success: false, error: `Variant not found: ${err.detail}` });
            case 'COUNTERPARTY_INACTIVE':
              return reply.status(400).send({ success: false, error: 'Counterparty is inactive' });
            case 'EMPTY_ORDER':
              return reply.status(400).send({ success: false, error: 'Order must contain at least one item' });
            case 'INVALID_QUANTITY':
              return reply.status(400).send({ success: false, error: `Invalid quantity for product ${err.detail}` });
            case 'INSUFFICIENT_STOCK':
              return reply.status(400).send({ success: false, error: `Not enough stock for ${err.detail}` });
            default:
              return reply.status(400).send({ success: false, error: err.message });
          }
        }
        throw err;
      }
    }
  );

  // Record a payment against the counterparty's overall balance (§13 step
  // 6, docs/B2B_COUNTERPARTIES.md §7) — not tied to a specific order, same
  // as the doc's design: a partial or lump-sum payment simply reduces the
  // running total. Overpayment is deliberately allowed: currentDebt can go
  // negative, meaning an advance/credit in the counterparty's favor, not
  // an error — same "don't clamp, the number is the honest signal"
  // reasoning already applied to POS stock (docs/POS_SYNC_API.md §18) and
  // now to money.
  fastify.post(
    '/counterparties/:id/payments',
    { preHandler: [permissionGuard('manageB2B')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.tenantId!;
      const parsed = recordPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }
      const { amount, note } = parsed.data;

      const counterparty = await prisma.counterparty.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!counterparty) return reply.status(404).send({ success: false, error: 'Counterparty not found' });

      // Same atomic cached-total + append-only-ledger-row pattern as
      // ORDER_CHARGE in order.service.ts's createB2BOrder() — a payment is
      // just the mirror-image delta.
      const result = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.counterparty.update({
          where: { id },
          data: { currentDebt: { decrement: amount } },
          select: { currentDebt: true },
        });
        const ledgerEntry = await tx.counterpartyLedger.create({
          data: {
            tenantId,
            counterpartyId: id,
            type: 'PAYMENT_RECEIVED',
            delta: -amount,
            orderId: null,
            note: note ?? null,
          },
        });
        return { ledgerEntry, currentDebt: updated.currentDebt };
      });

      return reply.status(201).send({ success: true, data: result });
    }
  );

  // Manual debt correction (found as a gap during the §13 step 8 test-
  // coverage audit — CounterpartyLedgerType.ADJUSTMENT existed in the
  // schema/docs but had no way to actually be created). Same atomic
  // cached-total + append-only-ledger-row transaction as ORDER_CHARGE/
  // PAYMENT_RECEIVED above, but delta can be either sign (a write-off
  // decreases the debt, a correction can increase it) and note is
  // required — unlike a payment, a manual adjustment isn't
  // self-explanatory and must always carry a reason. Also audited via
  // writeAuditLog(), same as due-date extension (§13 step 7) — both are
  // manual corrections to financial state that need a paper trail beyond
  // the ledger row itself.
  fastify.post(
    '/counterparties/:id/adjustments',
    { preHandler: [permissionGuard('manageB2B')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.tenantId!;
      const parsed = recordAdjustmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }
      const { delta, note } = parsed.data;

      const counterparty = await prisma.counterparty.findFirst({ where: { id, tenantId }, select: { id: true, currentDebt: true } });
      if (!counterparty) return reply.status(404).send({ success: false, error: 'Counterparty not found' });

      const previousDebt = counterparty.currentDebt;

      const result = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.counterparty.update({
          where: { id },
          data: { currentDebt: { increment: delta } },
          select: { currentDebt: true },
        });
        const ledgerEntry = await tx.counterpartyLedger.create({
          data: {
            tenantId,
            counterpartyId: id,
            type: 'ADJUSTMENT',
            delta,
            orderId: null,
            note,
          },
        });
        return { ledgerEntry, currentDebt: updated.currentDebt };
      });

      // Fire-and-forget, same convention as every other writeAuditLog()
      // call site (including due-date extension above) — not part of the
      // transaction, since it isn't designed to take a tx client and the
      // currentDebt/ledger write above is already atomic on its own.
      writeAuditLog({
        tenantId,
        actorId: request.user?.userId,
        action: 'b2b.debt.adjusted',
        targetId: id,
        details: { counterpartyId: id, delta, note, previousDebt, newDebt: result.currentDebt },
      });

      return reply.status(201).send({ success: true, data: result });
    }
  );

  // Full ORDER_CHARGE/PAYMENT_RECEIVED/ADJUSTMENT history for one
  // counterparty — the running balance alone (Counterparty.currentDebt)
  // isn't enough for a UI that needs to show how it got there.
  fastify.get(
    '/counterparties/:id/ledger',
    { preHandler: [permissionGuard('manageB2B')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.tenantId!;
      const parsed = listLedgerQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }
      const { page, pageSize } = parsed.data;
      const skip = (page - 1) * pageSize;

      const counterparty = await prisma.counterparty.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!counterparty) return reply.status(404).send({ success: false, error: 'Counterparty not found' });

      const where = { counterpartyId: id };
      const [items, total] = await Promise.all([
        prisma.counterpartyLedger.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.counterpartyLedger.count({ where }),
      ]);

      return {
        success: true,
        data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      };
    }
  );

  // Due-date extension (§13 step 7, docs/B2B_COUNTERPARTIES.md §7) — the
  // one deliberate exception to the ledger being append-only: dueDate is
  // updated in place on the existing ORDER_CHARGE row. originalDueDate is
  // never touched — it stays the frozen record of what was promised at
  // order time. The extension event itself is logged via the existing
  // writeAuditLog() into TenantAuditLog, not a new ledger row.
  fastify.patch(
    '/counterparties/:counterpartyId/ledger/:ledgerEntryId/due-date',
    { preHandler: [permissionGuard('manageB2B')] },
    async (request, reply) => {
      const { counterpartyId, ledgerEntryId } = request.params as { counterpartyId: string; ledgerEntryId: string };
      const tenantId = request.tenantId!;
      const parsed = extendDueDateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }

      const newDueDate = new Date(parsed.data.newDueDate);
      if (isNaN(newDueDate.getTime())) {
        return reply.status(400).send({ success: false, error: 'newDueDate must be a valid date' });
      }

      const ledgerEntry = await prisma.counterpartyLedger.findFirst({
        where: { id: ledgerEntryId, counterpartyId, tenantId },
      });
      if (!ledgerEntry) return reply.status(404).send({ success: false, error: 'Ledger entry not found' });

      if (ledgerEntry.type !== 'ORDER_CHARGE') {
        return reply.status(400).send({
          success: false,
          error: 'Only ORDER_CHARGE ledger entries have a due date that can be extended',
        });
      }

      // Conservative assumption (not fully specified by the doc): a
      // due-date "extension" must move the date strictly forward from the
      // entry's *current* dueDate — pulling it earlier, or "extending" to
      // the same date, isn't an extension. If product wants to allow
      // pulling a due date earlier too, that's a deliberate policy change,
      // not implied by "extension".
      const currentDueDate = ledgerEntry.dueDate;
      if (currentDueDate && newDueDate.getTime() <= currentDueDate.getTime()) {
        return reply.status(400).send({
          success: false,
          error: 'newDueDate must be strictly later than the current dueDate',
        });
      }

      const previousDueDate = ledgerEntry.dueDate;
      const updated = await prisma.counterpartyLedger.update({
        where: { id: ledgerEntryId },
        data: { dueDate: newDueDate },
      });

      // Fire-and-forget, same as every other writeAuditLog() call site in
      // the codebase (it swallows its own errors and isn't designed to
      // participate in a Prisma transaction) — the dueDate UPDATE above is
      // the one piece of state that actually needs atomicity, and a
      // single-column update on a single row already has that inherently.
      writeAuditLog({
        tenantId,
        actorId: request.user?.userId,
        action: 'b2b.debt.duedate_extended',
        targetId: ledgerEntry.id,
        details: {
          orderId: ledgerEntry.orderId,
          previousDueDate: previousDueDate?.toISOString() ?? null,
          newDueDate: newDueDate.toISOString(),
        },
      });

      return { success: true, data: updated };
    }
  );
}
