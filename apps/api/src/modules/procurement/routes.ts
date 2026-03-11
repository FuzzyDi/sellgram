import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';

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

      // Get next PO number
      const lastPO = await prisma.purchaseOrder.findFirst({
        where: { tenantId: request.tenantId! },
        orderBy: { poNumber: 'desc' },
      });
      const poNumber = (lastPO?.poNumber ?? 0) + 1;

      const totalCost = body.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);

      const po = await prisma.purchaseOrder.create({
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
            create: body.items.map(item => ({
              productId: item.productId,
              qty: item.qty,
              unitCost: item.unitCost,
              totalCost: item.qty * item.unitCost,
            })),
          },
        },
        include: { items: true },
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
    const totalForeignCost = po.items.reduce((sum, i) => sum + Number(i.totalCost), 0);
    const totalLocalCost = totalForeignCost * fxRate;
    const totalLanded = totalLocalCost + Number(po.shippingCost) + Number(po.customsCost);

    // Update each PO item + product stock + costPrice
    for (const receivedItem of items) {
      const poItem = po.items.find(i => i.id === receivedItem.itemId);
      if (!poItem) continue;

      // Update PO item
      await prisma.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: { qtyReceived: receivedItem.qtyReceived },
      });

      // Update product stock
      const stockUpdate = await prisma.product.updateMany({
        where: { id: poItem.productId, tenantId: request.tenantId! },
        data: { stockQty: { increment: receivedItem.qtyReceived } },
      });
      if (stockUpdate.count === 0) {
        return reply.status(400).send({ success: false, error: 'Product does not belong to tenant' });
      }

      // Calculate landed cost per unit
      const itemShare = Number(poItem.totalCost) / totalForeignCost;
      const itemLandedCost = totalLanded * itemShare;
      const perUnitLanded = receivedItem.qtyReceived > 0
        ? itemLandedCost / receivedItem.qtyReceived
        : 0;

      // Update product cost price (simplified: overwrite with latest)
      if (perUnitLanded > 0) {
        await prisma.product.updateMany({
          where: { id: poItem.productId, tenantId: request.tenantId! },
          data: { costPrice: Math.round(perUnitLanded) },
        });
      }
    }

    // Update PO status
    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        totalLanded: Math.round(totalLanded),
      },
    });

    return { success: true, message: 'PO received, stock and cost prices updated', totalLanded: Math.round(totalLanded) };
  });
}
