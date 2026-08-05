import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

const RETURN_STATUS = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
type ReturnStatus = typeof RETURN_STATUS[number];

const createReturnSchema = z.object({
  supplierId: z.string().min(1),
  purchaseOrderId: z.string().optional(),
  currency: z.string().default('USD'),
  fxRate: z.number().positive().optional(),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    qty: z.number().int().positive(),
    unitCost: z.number().positive(),
  })).min(1),
});

const updateReturnSchema = z.object({
  status: z.enum(RETURN_STATUS).optional(),
  purchaseOrderId: z.string().nullable().optional(),
  fxRate: z.number().positive().optional(),
  note: z.string().optional(),
});

const createItemSchema = z.object({
  productId: z.string(),
  qty: z.number().int().positive(),
  unitCost: z.number().positive(),
});

const updateItemSchema = z.object({
  qty: z.number().int().positive().optional(),
  unitCost: z.number().positive().optional(),
});

export default async function supplierReturnRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  const listQuerySchema = z.object({
    status: z.enum(RETURN_STATUS).optional(),
    supplierId: z.string().optional(),
  });

  // List returns
  fastify.get('/supplier-returns', async (request, reply) => {
    let query: z.infer<typeof listQuerySchema>;
    try {
      query = listQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const where: any = { tenantId: request.tenantId! };
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;

    const returns = await prisma.supplierReturn.findMany({
      where,
      include: {
        items: { include: { product: { select: { id: true, name: true } } } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return { success: true, data: returns };
  });

  // Get return
  fastify.get('/supplier-returns/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ret = await prisma.supplierReturn.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        supplier: { select: { id: true, name: true } },
      },
    });
    if (!ret) return reply.status(404).send({ success: false, error: 'Return not found' });
    return { success: true, data: ret };
  });

  // Create return
  fastify.post('/supplier-returns', {
    preHandler: [permissionGuard('manageCatalog'), planGuard('procurementEnabled')],
  }, async (request, reply) => {
    try {
      const body = createReturnSchema.parse(request.body);
      const tenantId = request.tenantId!;

      const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, tenantId }, select: { id: true } });
      if (!supplier) return reply.status(400).send({ success: false, error: 'Invalid supplier for tenant' });

      if (body.purchaseOrderId) {
        const po = await prisma.purchaseOrder.findFirst({ where: { id: body.purchaseOrderId, tenantId }, select: { id: true } });
        if (!po) return reply.status(400).send({ success: false, error: 'Invalid purchase order for tenant' });
      }

      const uniqueProductIds = [...new Set(body.items.map((item) => item.productId))];
      const ownedProducts = await prisma.product.findMany({ where: { tenantId, id: { in: uniqueProductIds } }, select: { id: true } });
      if (ownedProducts.length !== uniqueProductIds.length) {
        return reply.status(400).send({ success: false, error: 'One or more products are invalid for tenant' });
      }

      const totalCost = body.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);

      // Advisory lock per tenant, same reason as procurement/routes.ts's
      // POST /purchase-orders — prevents concurrent creates from getting
      // duplicate returnNumbers.
      const ret = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text || ':supplier-return'))`;
        const last = await tx.supplierReturn.findFirst({ where: { tenantId }, orderBy: { returnNumber: 'desc' } });
        const returnNumber = (last?.returnNumber ?? 0) + 1;
        return tx.supplierReturn.create({
          data: {
            tenantId,
            supplierId: body.supplierId,
            purchaseOrderId: body.purchaseOrderId ?? null,
            returnNumber,
            currency: body.currency,
            fxRate: body.fxRate,
            totalCost,
            note: body.note,
            items: {
              create: body.items.map((item) => ({
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

      return { success: true, data: ret };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Update return (header fields + DRAFT -> CANCELLED)
  fastify.patch('/supplier-returns/:id', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;
    let body: z.infer<typeof updateReturnSchema>;
    try {
      body = updateReturnSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    if (body.status === 'CONFIRMED') {
      return reply.status(400).send({ success: false, error: 'Use POST /confirm to confirm a return' });
    }

    try {
      await prisma.$transaction(async (tx: any) => {
        const ret = await tx.supplierReturn.findFirst({ where: { id, tenantId } });
        if (!ret) throw new Error('RETURN_NOT_FOUND');
        if (ret.status !== 'DRAFT') throw new Error('RETURN_LOCKED');

        if (body.purchaseOrderId) {
          const po = await tx.purchaseOrder.findFirst({ where: { id: body.purchaseOrderId, tenantId }, select: { id: true } });
          if (!po) throw new Error('INVALID_PURCHASE_ORDER');
        }

        const data: any = {};
        if (body.status === 'CANCELLED') data.status = 'CANCELLED';
        if (body.purchaseOrderId !== undefined) data.purchaseOrderId = body.purchaseOrderId;
        if (body.fxRate !== undefined) data.fxRate = body.fxRate;
        if (body.note !== undefined) data.note = body.note;

        await tx.supplierReturn.update({ where: { id }, data });
      });
    } catch (err: any) {
      if (err.message === 'RETURN_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Return not found' });
      if (err.message === 'RETURN_LOCKED') return reply.status(400).send({ success: false, error: 'This return has already been confirmed or cancelled' });
      if (err.message === 'INVALID_PURCHASE_ORDER') return reply.status(400).send({ success: false, error: 'Invalid purchase order for tenant' });
      return reply.status(400).send({ success: false, error: err.message });
    }

    return { success: true, message: 'Return updated' };
  });

  // Confirm — the "fixation" point: decrements stock and supplier debt
  // atomically, same shape as procurement/routes.ts's /receive but with
  // every delta negated (goods and money both flow back to the supplier).
  fastify.post('/supplier-returns/:id/confirm', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const ret = await prisma.supplierReturn.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!ret) return reply.status(404).send({ success: false, error: 'Return not found' });
    if (ret.status !== 'DRAFT') return reply.status(400).send({ success: false, error: `Return is already ${ret.status}` });

    const fxRate = Number(ret.fxRate) || 1;

    try {
      await prisma.$transaction(async (tx: any) => {
        for (const item of ret.items) {
          const product = await tx.product.findFirst({ where: { id: item.productId, tenantId }, select: { stockQty: true } });
          if (!product) throw new Error('PRODUCT_TENANT_MISMATCH');
          const qtyBefore = product.stockQty;
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { decrement: item.qty } },
            select: { stockQty: true },
          });

          await tx.stockLedgerEntry.create({
            data: {
              tenantId,
              productId: item.productId,
              variantId: null,
              delta: -item.qty,
              reason: 'SUPPLIER_RETURN',
              sourceType: 'SUPPLIER_RETURN',
              sourceId: ret.id,
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              variantId: null,
              delta: -item.qty,
              qtyBefore,
              qtyAfter: updated.stockQty,
              note: `Return #${ret.returnNumber} to supplier`,
              userId: request.user?.userId,
            },
          });
        }

        const debtDelta = -Math.round(Number(ret.totalCost) * fxRate);
        await tx.supplier.update({ where: { id: ret.supplierId }, data: { currentDebt: { increment: debtDelta } } });
        await tx.supplierLedger.create({
          data: {
            tenantId,
            supplierId: ret.supplierId,
            type: 'RETURN',
            delta: debtDelta,
            supplierReturnId: ret.id,
            purchaseOrderId: ret.purchaseOrderId,
            note: `Return #${ret.returnNumber}${ret.purchaseOrderId ? ' (linked purchase)' : ''}`,
          },
        });

        await tx.supplierReturn.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      });
    } catch (err: any) {
      if (err.message === 'PRODUCT_TENANT_MISMATCH') {
        return reply.status(400).send({ success: false, error: 'Product does not belong to tenant' });
      }
      return reply.status(500).send({ success: false, error: 'Failed to confirm return' });
    }

    return { success: true, message: 'Return confirmed, stock and supplier debt updated' };
  });

  // Line-item CRUD — only while DRAFT, same reasoning as
  // procurement/routes.ts's item CRUD.
  async function assertEditable(tx: any, id: string, tenantId: string) {
    const ret = await tx.supplierReturn.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!ret) throw new Error('RETURN_NOT_FOUND');
    if (ret.status !== 'DRAFT') throw new Error('RETURN_LOCKED');
    return ret;
  }

  function itemCrudErrorReply(reply: any, err: any) {
    if (err.message === 'RETURN_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Return not found' });
    if (err.message === 'RETURN_LOCKED') return reply.status(400).send({ success: false, error: 'This return has already been confirmed or cancelled' });
    if (err.message === 'ITEM_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Item not found' });
    if (err.message === 'INVALID_PRODUCT') return reply.status(400).send({ success: false, error: 'Invalid product for tenant' });
    if (err.message === 'LAST_ITEM') return reply.status(400).send({ success: false, error: 'A return must have at least one item' });
    return reply.status(400).send({ success: false, error: err.message });
  }

  fastify.post('/supplier-returns/:id/items', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;
    let body: z.infer<typeof createItemSchema>;
    try {
      body = createItemSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    try {
      const result = await prisma.$transaction(async (tx: any) => {
        await assertEditable(tx, id, tenantId);
        const product = await tx.product.findFirst({ where: { id: body.productId, tenantId }, select: { id: true } });
        if (!product) throw new Error('INVALID_PRODUCT');

        const item = await tx.supplierReturnItem.create({
          data: { supplierReturnId: id, productId: body.productId, qty: body.qty, unitCost: body.unitCost, totalCost: body.qty * body.unitCost },
          include: { product: { select: { id: true, name: true } } },
        });
        const items = await tx.supplierReturnItem.findMany({ where: { supplierReturnId: id }, select: { totalCost: true } });
        const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
        await tx.supplierReturn.update({ where: { id }, data: { totalCost } });
        return { item, totalCost };
      });
      return reply.status(201).send({ success: true, data: result });
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });

  fastify.patch('/supplier-returns/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const tenantId = request.tenantId!;
    let body: z.infer<typeof updateItemSchema>;
    try {
      body = updateItemSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    try {
      const result = await prisma.$transaction(async (tx: any) => {
        const ret = await assertEditable(tx, id, tenantId);
        const existing = ret.items.find((i: any) => i.id === itemId);
        if (!existing) throw new Error('ITEM_NOT_FOUND');

        const qty = body.qty ?? existing.qty;
        const unitCost = body.unitCost ?? Number(existing.unitCost);
        const item = await tx.supplierReturnItem.update({
          where: { id: itemId },
          data: { qty, unitCost, totalCost: qty * unitCost },
          include: { product: { select: { id: true, name: true } } },
        });
        const items = await tx.supplierReturnItem.findMany({ where: { supplierReturnId: id }, select: { totalCost: true } });
        const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
        await tx.supplierReturn.update({ where: { id }, data: { totalCost } });
        return { item, totalCost };
      });
      return { success: true, data: result };
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });

  fastify.delete('/supplier-returns/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const tenantId = request.tenantId!;

    try {
      const result = await prisma.$transaction(async (tx: any) => {
        const ret = await assertEditable(tx, id, tenantId);
        const existing = ret.items.find((i: any) => i.id === itemId);
        if (!existing) throw new Error('ITEM_NOT_FOUND');
        if (ret.items.length <= 1) throw new Error('LAST_ITEM');

        await tx.supplierReturnItem.delete({ where: { id: itemId } });
        const items = await tx.supplierReturnItem.findMany({ where: { supplierReturnId: id }, select: { totalCost: true } });
        const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
        await tx.supplierReturn.update({ where: { id }, data: { totalCost } });
        return { totalCost };
      });
      return { success: true, data: result };
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });
}
