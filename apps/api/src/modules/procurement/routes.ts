import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';

const PO_STATUS = ['DRAFT', 'ORDERED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const;
type POStatus = typeof PO_STATUS[number];

const PO_TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT:      ['ORDERED', 'CANCELLED'],
  ORDERED:    ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['CANCELLED'],     // RECEIVED only via /receive endpoint
  RECEIVED:   [],
  CANCELLED:  [],
};

function canTransitionPO(from: POStatus, to: POStatus): boolean {
  return PO_TRANSITIONS[from]?.includes(to) ?? false;
}

const createPOSchema = z.object({
  supplierName: z.string().min(1),
  currency: z.string().default('USD'),
  fxRate: z.number().positive().optional(),
  shippingCost: z.number().min(0).default(0),
  customsCost: z.number().min(0).default(0),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    qty: z.number().int().positive(),
    unitCost: z.number().positive(),
  })).min(1),
});

export default async function procurementRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // List POs
  fastify.get('/purchase-orders', async (request) => {
    const { status } = request.query as any;
    const where: any = { tenantId: request.tenantId! };
    if (status) where.status = status;

    const pos = await prisma.purchaseOrder.findMany({
      where,
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: pos };
  });

  // Get PO
  fastify.get('/purchase-orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
    });
    if (!po) return reply.status(404).send({ success: false, error: 'PO not found' });
    return { success: true, data: po };
  });

  // Create PO
  fastify.post('/purchase-orders', {
    preHandler: [planGuard('procurementEnabled')],
  }, async (request, reply) => {
    try {
      const body = createPOSchema.parse(request.body);
      const uniqueProductIds = [...new Set(body.items.map((item) => item.productId))];
      const ownedProducts = await prisma.product.findMany({
        where: { tenantId: request.tenantId!, id: { in: uniqueProductIds } },
        select: { id: true },
      });
      if (ownedProducts.length !== uniqueProductIds.length) {
        return reply.status(400).send({ success: false, error: 'One or more products are invalid for tenant' });
      }

      const totalCost = body.items.reduce((sum: number, item: any) => sum + item.qty * item.unitCost, 0);

      // Advisory lock per tenant prevents concurrent POs from getting duplicate poNumbers
      const po = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${request.tenantId!}::text || ':po'))`;
        const lastPO = await tx.purchaseOrder.findFirst({
          where: { tenantId: request.tenantId! },
          orderBy: { poNumber: 'desc' },
        });
        const poNumber = (lastPO?.poNumber ?? 0) + 1;
        return tx.purchaseOrder.create({
        data: {
          tenantId: request.tenantId!,
          poNumber,
          supplierName: body.supplierName,
          currency: body.currency,
          fxRate: body.fxRate,
          shippingCost: body.shippingCost,
          customsCost: body.customsCost,
          totalCost,
          note: body.note,
          items: {
            create: body.items.map((item: any) => ({
              productId: item.productId,
              qty: item.qty,
              unitCost: item.unitCost,
              totalCost: item.qty * item.unitCost,
            })),
          },
        },
        include: { items: true },
        });
      });

      return { success: true, data: po };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Update PO
  fastify.patch('/purchase-orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, fxRate, shippingCost, customsCost, note } = request.body as any;

    if (status !== undefined) {
      if (!PO_STATUS.includes(status as POStatus)) {
        return reply.status(400).send({ success: false, error: `Invalid status: ${status}` });
      }
      if (status === 'RECEIVED') {
        return reply.status(400).send({ success: false, error: 'Use POST /receive to mark PO as received' });
      }
      const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId: request.tenantId! } });
      if (!po) return reply.status(404).send({ success: false, error: 'PO not found' });
      if (!canTransitionPO(po.status as POStatus, status as POStatus)) {
        return reply.status(400).send({ success: false, error: `Cannot transition PO from ${po.status} to ${status}` });
      }
    }

    const data: any = {};
    if (status) data.status = status;
    if (fxRate !== undefined) data.fxRate = fxRate;
    if (shippingCost !== undefined) data.shippingCost = shippingCost;
    if (customsCost !== undefined) data.customsCost = customsCost;
    if (note !== undefined) data.note = note;
    if (status === 'ORDERED') data.orderedAt = new Date();

    const result = await prisma.purchaseOrder.updateMany({
      where: { id, tenantId: request.tenantId! },
      data,
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'PO not found' });
    return { success: true, message: 'PO updated' };
  });

  // Receive PO (critical business logic)
  fastify.post('/purchase-orders/:id/receive', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { items } = request.body as { items: Array<{ itemId: string; qtyReceived: number }> };

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: { items: true },
    });
    if (!po) return reply.status(404).send({ success: false, error: 'PO not found' });
    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') {
      return reply.status(400).send({ success: false, error: `PO is already ${po.status}` });
    }

    const fxRate = Number(po.fxRate) || 1;
    const totalForeignCost = po.items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
    const totalLocalCost = totalForeignCost * fxRate;
    const totalLanded = totalLocalCost + Number(po.shippingCost) + Number(po.customsCost);
    const tenantId = request.tenantId!;

    // Wrap all stock + status updates in a transaction so a mid-flight failure
    // cannot leave stock partially updated with PO still marked IN_TRANSIT.
    try {
    await prisma.$transaction(async (tx: any) => {
      for (const receivedItem of items) {
        const poItem = po.items.find((i: any) => i.id === receivedItem.itemId);
        if (!poItem) continue;

        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { qtyReceived: receivedItem.qtyReceived },
        });

        const stockUpdate = await tx.product.updateMany({
          where: { id: poItem.productId, tenantId },
          data: { stockQty: { increment: receivedItem.qtyReceived } },
        });
        if (stockUpdate.count === 0) {
          throw new Error('PRODUCT_TENANT_MISMATCH');
        }

        const itemShare = Number(poItem.totalCost) / totalForeignCost;
        const itemLandedCost = totalLanded * itemShare;
        const perUnitLanded = receivedItem.qtyReceived > 0
          ? itemLandedCost / receivedItem.qtyReceived
          : 0;

        if (perUnitLanded > 0) {
          await tx.product.updateMany({
            where: { id: poItem.productId, tenantId },
            data: { costPrice: Math.round(perUnitLanded) },
          });
        }
      }

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'RECEIVED', receivedAt: new Date(), totalLanded: Math.round(totalLanded) },
      });
    });

    } catch (err: any) {
      if (err.message === 'PRODUCT_TENANT_MISMATCH') {
        return reply.status(400).send({ success: false, error: 'Product does not belong to tenant' });
      }
      return reply.status(500).send({ success: false, error: 'Failed to receive PO' });
    }

    return { success: true, message: 'PO received, stock and cost prices updated', totalLanded: Math.round(totalLanded) };
  });
}
