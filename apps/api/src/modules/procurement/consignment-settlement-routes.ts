import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { planGuard } from '../../plugins/plan-guard.js';

const SETTLEMENT_STATUS = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;

const createSettlementSchema = z.object({
  purchaseOrderId: z.string(),
  note: z.string().optional(),
});

const updateSettlementSchema = z.object({
  status: z.enum(SETTLEMENT_STATUS).optional(),
  note: z.string().optional(),
});

const updateItemSchema = z.object({
  qtySold: z.number().int().min(0),
});

// Sum of qtySold across every CONFIRMED settlement item for this PO item —
// DRAFT settlements never count (nothing charged yet, see schema.prisma
// comment on ConsignmentSettlement). "remaining" is qtyReceived minus that
// sum: how much of what actually arrived hasn't been declared sold yet.
async function remainingForPoItem(tx: any, purchaseOrderItemId: string): Promise<number> {
  const poItem = await tx.purchaseOrderItem.findUnique({
    where: { id: purchaseOrderItemId },
    select: { qtyReceived: true },
  });
  const settled = await tx.consignmentSettlementItem.aggregate({
    where: { purchaseOrderItemId, consignmentSettlement: { status: 'CONFIRMED' } },
    _sum: { qtySold: true },
  });
  return (poItem?.qtyReceived ?? 0) - (settled._sum.qtySold ?? 0);
}

export default async function consignmentSettlementRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  const listQuerySchema = z.object({
    status: z.enum(SETTLEMENT_STATUS).optional(),
    purchaseOrderId: z.string().optional(),
  });

  fastify.get('/consignment-settlements', async (request, reply) => {
    let query: z.infer<typeof listQuerySchema>;
    try {
      query = listQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const where: any = { tenantId: request.tenantId! };
    if (query.status) where.status = query.status;
    if (query.purchaseOrderId) where.purchaseOrderId = query.purchaseOrderId;

    const settlements = await prisma.consignmentSettlement.findMany({
      where,
      include: {
        purchaseOrder: { select: { id: true, poNumber: true, supplierName: true, currency: true } },
        items: { include: { purchaseOrderItem: { include: { product: { select: { id: true, name: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // The admin UI renders its detail card straight from this list (same
    // pattern every other document type here uses — no separate per-id
    // fetch on selection), so "remaining" has to be attached here too, not
    // just on the single-item GET below.
    const settlementsWithRemaining = await Promise.all(
      settlements.map(async (settlement: any) => ({
        ...settlement,
        items: await Promise.all(
          settlement.items.map(async (item: any) => ({
            ...item,
            remaining: await remainingForPoItem(prisma, item.purchaseOrderItemId),
          }))
        ),
      }))
    );

    return { success: true, data: settlementsWithRemaining };
  });

  fastify.get('/consignment-settlements/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const settlement = await prisma.consignmentSettlement.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: {
        purchaseOrder: { select: { id: true, poNumber: true, supplierName: true, currency: true, fxRate: true } },
        items: { include: { purchaseOrderItem: { include: { product: { select: { id: true, name: true, sku: true } } } } } },
      },
    });
    if (!settlement) return reply.status(404).send({ success: false, error: 'Settlement not found' });

    const itemsWithRemaining = await Promise.all(
      settlement.items.map(async (item: any) => ({
        ...item,
        remaining: await remainingForPoItem(prisma, item.purchaseOrderItemId),
      }))
    );

    return { success: true, data: { ...settlement, items: itemsWithRemaining } };
  });

  // Create — auto-populates one item per line of the linked PO (no manual
  // product picker; see schema.prisma comment on ConsignmentSettlement).
  fastify.post('/consignment-settlements', { preHandler: [permissionGuard('manageCatalog'), planGuard('procurementEnabled')] }, async (request, reply) => {
    try {
      const body = createSettlementSchema.parse(request.body);
      const tenantId = request.tenantId!;

      const po = await prisma.purchaseOrder.findFirst({
        where: { id: body.purchaseOrderId, tenantId },
        include: { items: true },
      });
      if (!po) return reply.status(400).send({ success: false, error: 'Invalid purchase order for tenant' });
      if (po.paymentMethod !== 'CONSIGNMENT') {
        return reply.status(400).send({ success: false, error: 'Only a consignment (под реализацию) purchase order can be settled' });
      }
      if (po.status !== 'RECEIVED') {
        return reply.status(400).send({ success: false, error: 'The purchase order must be received before it can be settled' });
      }

      const remainingPerItem = await Promise.all(
        po.items.map(async (item: any) => ({ item, remaining: await remainingForPoItem(prisma, item.id) }))
      );
      if (remainingPerItem.every(({ remaining }) => remaining <= 0)) {
        return reply.status(400).send({ success: false, error: 'This purchase order has already been fully settled' });
      }

      const settlement = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text || ':consignment-settlement'))`;
        const last = await tx.consignmentSettlement.findFirst({ where: { tenantId }, orderBy: { settlementNumber: 'desc' } });
        const settlementNumber = (last?.settlementNumber ?? 0) + 1;
        return tx.consignmentSettlement.create({
          data: {
            tenantId,
            settlementNumber,
            purchaseOrderId: po.id,
            note: body.note,
            items: {
              create: po.items.map((item: any) => ({
                purchaseOrderItemId: item.id,
                unitCost: item.unitCost,
                qtySold: 0,
                debtCharged: 0,
              })),
            },
          },
          include: { items: true },
        });
      });

      return { success: true, data: settlement };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/consignment-settlements/:id', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;
    let body: z.infer<typeof updateSettlementSchema>;
    try {
      body = updateSettlementSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    if (body.status === 'CONFIRMED') {
      return reply.status(400).send({ success: false, error: 'Use POST /confirm to confirm a settlement' });
    }

    try {
      await prisma.$transaction(async (tx: any) => {
        const settlement = await tx.consignmentSettlement.findFirst({ where: { id, tenantId } });
        if (!settlement) throw new Error('SETTLEMENT_NOT_FOUND');
        if (settlement.status !== 'DRAFT') throw new Error('SETTLEMENT_LOCKED');

        const data: any = {};
        if (body.status === 'CANCELLED') data.status = 'CANCELLED';
        if (body.note !== undefined) data.note = body.note;

        await tx.consignmentSettlement.update({ where: { id }, data });
      });
    } catch (err: any) {
      if (err.message === 'SETTLEMENT_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Settlement not found' });
      if (err.message === 'SETTLEMENT_LOCKED') return reply.status(400).send({ success: false, error: 'This settlement has already been confirmed or cancelled' });
      return reply.status(400).send({ success: false, error: err.message });
    }

    return { success: true, message: 'Settlement updated' };
  });

  fastify.patch('/consignment-settlements/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const tenantId = request.tenantId!;
    let body: z.infer<typeof updateItemSchema>;
    try {
      body = updateItemSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    try {
      const item = await prisma.$transaction(async (tx: any) => {
        const settlement = await tx.consignmentSettlement.findFirst({ where: { id, tenantId }, include: { items: true } });
        if (!settlement) throw new Error('SETTLEMENT_NOT_FOUND');
        if (settlement.status !== 'DRAFT') throw new Error('SETTLEMENT_LOCKED');
        const existing = settlement.items.find((i: any) => i.id === itemId);
        if (!existing) throw new Error('ITEM_NOT_FOUND');

        const remaining = await remainingForPoItem(tx, existing.purchaseOrderItemId);
        if (body.qtySold > remaining) throw new Error('OVERSOLD');

        return tx.consignmentSettlementItem.update({
          where: { id: itemId },
          data: { qtySold: body.qtySold, debtCharged: body.qtySold * Number(existing.unitCost) },
          include: { purchaseOrderItem: { include: { product: { select: { id: true, name: true } } } } },
        });
      });
      return { success: true, data: item };
    } catch (err: any) {
      if (err.message === 'SETTLEMENT_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Settlement not found' });
      if (err.message === 'SETTLEMENT_LOCKED') return reply.status(400).send({ success: false, error: 'This settlement has already been confirmed or cancelled' });
      if (err.message === 'ITEM_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Item not found' });
      if (err.message === 'OVERSOLD') return reply.status(400).send({ success: false, error: 'Quantity sold exceeds what remains unsettled for this item' });
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Confirm — sums qtySold * unitCost across items (PO currency), converts
  // to UZS via the PO's own fxRate (identical conversion to /receive's
  // CREDIT charge), and posts one SupplierLedger PURCHASE_CHARGE row. A
  // settlement where nothing was reported sold (total 0) confirms without
  // touching Supplier.currentDebt or writing a ledger row at all.
  fastify.post('/consignment-settlements/:id/confirm', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const settlement = await prisma.consignmentSettlement.findFirst({
      where: { id, tenantId },
      include: { items: true, purchaseOrder: true },
    });
    if (!settlement) return reply.status(404).send({ success: false, error: 'Settlement not found' });
    if (settlement.status !== 'DRAFT') return reply.status(400).send({ success: false, error: `Settlement is already ${settlement.status}` });

    try {
      await prisma.$transaction(async (tx: any) => {
        // Serializes concurrent confirms against the *same PO* — without
        // this, two DRAFT settlements each reporting qtySold within the
        // (pre-either-commit) remaining balance could both pass the
        // OVERSOLD check and jointly charge more than was ever received
        // (remainingForPoItem only reads confirmed settlements, so two
        // concurrent transactions under READ COMMITTED can each see the
        // same pre-charge "remaining"). Scoped to this PO, not the whole
        // tenant, so unrelated consignment settlements aren't serialized
        // against each other.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text || ':consignment-settlement:' || ${settlement.purchaseOrderId}::text))`;

        let totalForeignCost = 0;
        for (const item of settlement.items) {
          if (item.qtySold <= 0) continue;
          const remaining = await remainingForPoItem(tx, item.purchaseOrderItemId);
          if (item.qtySold > remaining) throw new Error('OVERSOLD');
          totalForeignCost += item.qtySold * Number(item.unitCost);
        }

        const fxRate = Number(settlement.purchaseOrder.fxRate) || 1;
        const totalDebtCharged = Math.round(totalForeignCost * fxRate);

        if (totalDebtCharged > 0 && settlement.purchaseOrder.supplierId) {
          await tx.supplier.update({
            where: { id: settlement.purchaseOrder.supplierId },
            data: { currentDebt: { increment: totalDebtCharged } },
          });
          await tx.supplierLedger.create({
            data: {
              tenantId,
              supplierId: settlement.purchaseOrder.supplierId,
              type: 'PURCHASE_CHARGE',
              delta: totalDebtCharged,
              purchaseOrderId: settlement.purchaseOrder.id,
              consignmentSettlementId: settlement.id,
              note: `Реализация #${settlement.settlementNumber} (PO-${settlement.purchaseOrder.poNumber})`,
            },
          });
        }

        await tx.consignmentSettlement.update({
          where: { id },
          data: { status: 'CONFIRMED', confirmedAt: new Date(), totalDebtCharged },
        });
      });
    } catch (err: any) {
      if (err.message === 'OVERSOLD') {
        return reply.status(400).send({ success: false, error: 'One or more items now exceed what remains unsettled — reload and adjust before confirming' });
      }
      return reply.status(500).send({ success: false, error: 'Failed to confirm settlement' });
    }

    return { success: true, message: 'Settlement confirmed, supplier debt updated' };
  });
}
