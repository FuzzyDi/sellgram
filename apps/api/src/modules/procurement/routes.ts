import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

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

const PO_PAYMENT_METHODS = ['CASH', 'NON_CASH', 'CREDIT'] as const;

const updatePOSchema = z.object({
  status: z.enum(PO_STATUS).optional(),
  paymentMethod: z.enum(PO_PAYMENT_METHODS).optional(),
  fxRate: z.number().positive().optional(),
  shippingCost: z.number().min(0).optional(),
  customsCost: z.number().min(0).optional(),
  note: z.string().optional(),
});

const receiveItemSchema = z.object({
  itemId: z.string(),
  qtyReceived: z.number().int().min(0),
});

const receivePOSchema = z.object({
  items: z.array(receiveItemSchema).min(1),
});

const createPOSchema = z.object({
  supplierName: z.string().min(1),
  supplierId: z.string().optional(),
  paymentMethod: z.enum(PO_PAYMENT_METHODS).default('CASH'),
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

  const listPOQuerySchema = z.object({
    status: z.enum(PO_STATUS).optional(),
  });

  // List POs
  fastify.get('/purchase-orders', async (request, reply) => {
    let query: z.infer<typeof listPOQuerySchema>;
    try {
      query = listPOQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const where: any = { tenantId: request.tenantId! };
    if (query.status) where.status = query.status;

    const pos = await prisma.purchaseOrder.findMany({
      where,
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
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
    preHandler: [permissionGuard('manageCatalog'), planGuard('procurementEnabled')],
  }, async (request, reply) => {
    try {
      const body = createPOSchema.parse(request.body);
      if (body.paymentMethod === 'CREDIT' && !body.supplierId) {
        return reply.status(400).send({ success: false, error: 'Credit purchases must be linked to a saved supplier' });
      }
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
          supplierId: body.supplierId ?? null,
          supplierName: body.supplierName,
          paymentMethod: body.paymentMethod,
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
  fastify.patch('/purchase-orders/:id', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let body: z.infer<typeof updatePOSchema>;
    try {
      body = updatePOSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const { status, paymentMethod, fxRate, shippingCost, customsCost, note } = body;

    if (status === 'RECEIVED') {
      return reply.status(400).send({ success: false, error: 'Use POST /receive to mark PO as received' });
    }

    try {
      await prisma.$transaction(async (tx: any) => {
        const po = await tx.purchaseOrder.findFirst({ where: { id, tenantId: request.tenantId! } });
        if (!po) throw new Error('PO_NOT_FOUND');
        if (status !== undefined && !canTransitionPO(po.status as POStatus, status as POStatus)) {
          throw new Error(`INVALID_TRANSITION:${po.status}:${status}`);
        }
        // paymentMethod only matters at receive time (SupplierLedger charge
        // for CREDIT) — once RECEIVED, changing it would silently disagree
        // with whatever ledger entry (or lack of one) already happened.
        if (paymentMethod !== undefined && po.status === 'RECEIVED') {
          throw new Error('CANNOT_CHANGE_PAYMENT_METHOD_AFTER_RECEIVED');
        }
        if (paymentMethod === 'CREDIT' && !po.supplierId) {
          throw new Error('CREDIT_REQUIRES_SUPPLIER');
        }

        const data: any = {};
        if (status !== undefined) data.status = status;
        if (paymentMethod !== undefined) data.paymentMethod = paymentMethod;
        if (fxRate !== undefined) data.fxRate = fxRate;
        if (shippingCost !== undefined) data.shippingCost = shippingCost;
        if (customsCost !== undefined) data.customsCost = customsCost;
        if (note !== undefined) data.note = note;
        if (status === 'ORDERED') data.orderedAt = new Date();

        await tx.purchaseOrder.update({ where: { id }, data });
      });
    } catch (err: any) {
      if (err.message === 'PO_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'PO not found' });
      }
      if (err.message === 'CANNOT_CHANGE_PAYMENT_METHOD_AFTER_RECEIVED') {
        return reply.status(400).send({ success: false, error: 'Cannot change payment method after the PO has been received' });
      }
      if (err.message === 'CREDIT_REQUIRES_SUPPLIER') {
        return reply.status(400).send({ success: false, error: 'Credit purchases must be linked to a saved supplier' });
      }
      if (err.message.startsWith('INVALID_TRANSITION:')) {
        const [, from, to] = err.message.split(':');
        return reply.status(400).send({ success: false, error: `Cannot transition PO from ${from} to ${to}` });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }

    return { success: true, message: 'PO updated' };
  });

  // Receive PO (critical business logic)
  fastify.post('/purchase-orders/:id/receive', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let receiveBody: z.infer<typeof receivePOSchema>;
    try {
      receiveBody = receivePOSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const { items } = receiveBody;

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
    let debtCharged = 0;
    try {
    await prisma.$transaction(async (tx: any) => {
      // Local-currency cost of goods actually received in this call — the
      // basis for the SupplierLedger charge below. Deliberately excludes
      // shipping/customs (those aren't necessarily owed to this supplier)
      // and is computed from qtyReceived, not the ordered qty, so a partial
      // receive only charges for what actually arrived.
      let receivedForeignCost = 0;

      for (const receivedItem of items) {
        const poItem = po.items.find((i: any) => i.id === receivedItem.itemId);
        if (!poItem) continue;

        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { qtyReceived: receivedItem.qtyReceived },
        });

        const product = await tx.product.findFirst({
          where: { id: poItem.productId, tenantId },
          select: { stockQty: true },
        });
        if (!product) {
          throw new Error('PRODUCT_TENANT_MISMATCH');
        }
        const qtyBefore = product.stockQty;
        const updatedProduct = await tx.product.update({
          where: { id: poItem.productId },
          data: { stockQty: { increment: receivedItem.qtyReceived } },
          select: { stockQty: true },
        });

        // docs gap fixed here: receiving a PO previously moved stockQty
        // directly with no StockLedgerEntry/StockMovement row, so it never
        // showed up in the stock history POS/admin already show for every
        // other stock change (pos-sync's applyStockDelta, checkout, admin
        // stock-adjust). Same RESTOCK reason those already define but never
        // had a writer for.
        if (receivedItem.qtyReceived !== 0) {
          await tx.stockLedgerEntry.create({
            data: {
              tenantId,
              productId: poItem.productId,
              variantId: null,
              delta: receivedItem.qtyReceived,
              reason: 'RESTOCK',
              sourceType: 'PURCHASE_ORDER',
              sourceId: po.id,
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: poItem.productId,
              variantId: null,
              delta: receivedItem.qtyReceived,
              qtyBefore,
              qtyAfter: updatedProduct.stockQty,
              note: `PO #${po.poNumber} received`,
              userId: request.user?.userId,
            },
          });
        }

        receivedForeignCost += receivedItem.qtyReceived * Number(poItem.unitCost);

        const itemShare = totalForeignCost > 0 ? Number(poItem.totalCost) / totalForeignCost : 0;
        const itemLandedCost = totalLanded * itemShare;
        const perUnitLanded = receivedItem.qtyReceived > 0
          ? itemLandedCost / receivedItem.qtyReceived
          : 0;

        if (perUnitLanded > 0) {
          await tx.product.update({
            where: { id: poItem.productId },
            data: { costPrice: Math.round(perUnitLanded) },
          });
        }
      }

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'RECEIVED', receivedAt: new Date(), totalLanded: Math.round(totalLanded) },
      });

      // Payables charge — only for CREDIT POs, and only for a supplier
      // actually on file (createPOSchema/updatePOSchema both already
      // enforce CREDIT requires a linked supplierId, so po.supplierId is
      // expected to be set here; the null-check is defense in depth, not
      // a real gap).
      if (po.paymentMethod === 'CREDIT' && po.supplierId && receivedForeignCost > 0) {
        debtCharged = Math.round(receivedForeignCost * fxRate);
        await tx.supplier.update({
          where: { id: po.supplierId },
          data: { currentDebt: { increment: debtCharged } },
        });
        await tx.supplierLedger.create({
          data: {
            tenantId,
            supplierId: po.supplierId,
            type: 'PURCHASE_CHARGE',
            delta: debtCharged,
            purchaseOrderId: po.id,
            note: `PO #${po.poNumber} received on credit`,
          },
        });
      }
    });

    } catch (err: any) {
      if (err.message === 'PRODUCT_TENANT_MISMATCH') {
        return reply.status(400).send({ success: false, error: 'Product does not belong to tenant' });
      }
      return reply.status(500).send({ success: false, error: 'Failed to receive PO' });
    }

    return {
      success: true,
      message: 'PO received, stock and cost prices updated',
      data: { totalLanded: Math.round(totalLanded), debtCharged },
    };
  });
}
