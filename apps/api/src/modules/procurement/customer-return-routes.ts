import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

const RETURN_STATUS = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;

const createReturnSchema = z.object({
  counterpartyId: z.string().optional(),
  orderId: z.string().optional(),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    qty: z.number().int().positive(),
    unitCost: z.number().min(0),
  })).min(1),
});

const updateReturnSchema = z.object({
  status: z.enum(RETURN_STATUS).optional(),
  counterpartyId: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
  note: z.string().optional(),
});

const createItemSchema = z.object({
  productId: z.string(),
  qty: z.number().int().positive(),
  unitCost: z.number().min(0),
});

const updateItemSchema = z.object({
  qty: z.number().int().positive().optional(),
  unitCost: z.number().min(0).optional(),
});

export default async function customerReturnRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  const listQuerySchema = z.object({ status: z.enum(RETURN_STATUS).optional() });

  fastify.get('/customer-returns', async (request, reply) => {
    let query: z.infer<typeof listQuerySchema>;
    try {
      query = listQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const where: any = { tenantId: request.tenantId! };
    if (query.status) where.status = query.status;

    const returns = await prisma.customerReturn.findMany({
      where,
      include: {
        items: { include: { product: { select: { id: true, name: true } } } },
        counterparty: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return { success: true, data: returns };
  });

  fastify.get('/customer-returns/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ret = await prisma.customerReturn.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        counterparty: { select: { id: true, name: true } },
      },
    });
    if (!ret) return reply.status(404).send({ success: false, error: 'Return not found' });
    return { success: true, data: ret };
  });

  fastify.post('/customer-returns', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    try {
      const body = createReturnSchema.parse(request.body);
      const tenantId = request.tenantId!;

      if (body.counterpartyId) {
        const cp = await prisma.counterparty.findFirst({ where: { id: body.counterpartyId, tenantId }, select: { id: true } });
        if (!cp) return reply.status(400).send({ success: false, error: 'Invalid counterparty for tenant' });
      }
      if (body.orderId) {
        const order = await prisma.order.findFirst({ where: { id: body.orderId, tenantId }, select: { id: true } });
        if (!order) return reply.status(400).send({ success: false, error: 'Invalid order for tenant' });
      }

      const uniqueProductIds = [...new Set(body.items.map((item) => item.productId))];
      const ownedProducts = await prisma.product.findMany({ where: { tenantId, id: { in: uniqueProductIds } }, select: { id: true } });
      if (ownedProducts.length !== uniqueProductIds.length) {
        return reply.status(400).send({ success: false, error: 'One or more products are invalid for tenant' });
      }

      const totalCost = body.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);

      const ret = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text || ':customer-return'))`;
        const last = await tx.customerReturn.findFirst({ where: { tenantId }, orderBy: { returnNumber: 'desc' } });
        const returnNumber = (last?.returnNumber ?? 0) + 1;
        return tx.customerReturn.create({
          data: {
            tenantId,
            returnNumber,
            counterpartyId: body.counterpartyId ?? null,
            orderId: body.orderId ?? null,
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

  fastify.patch('/customer-returns/:id', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
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
        const ret = await tx.customerReturn.findFirst({ where: { id, tenantId } });
        if (!ret) throw new Error('RETURN_NOT_FOUND');
        if (ret.status !== 'DRAFT') throw new Error('RETURN_LOCKED');

        if (body.counterpartyId) {
          const cp = await tx.counterparty.findFirst({ where: { id: body.counterpartyId, tenantId }, select: { id: true } });
          if (!cp) throw new Error('INVALID_COUNTERPARTY');
        }
        if (body.orderId) {
          const order = await tx.order.findFirst({ where: { id: body.orderId, tenantId }, select: { id: true } });
          if (!order) throw new Error('INVALID_ORDER');
        }

        const data: any = {};
        if (body.status === 'CANCELLED') data.status = 'CANCELLED';
        if (body.counterpartyId !== undefined) data.counterpartyId = body.counterpartyId;
        if (body.orderId !== undefined) data.orderId = body.orderId;
        if (body.note !== undefined) data.note = body.note;

        await tx.customerReturn.update({ where: { id }, data });
      });
    } catch (err: any) {
      if (err.message === 'RETURN_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Return not found' });
      if (err.message === 'RETURN_LOCKED') return reply.status(400).send({ success: false, error: 'This return has already been confirmed or cancelled' });
      if (err.message === 'INVALID_COUNTERPARTY') return reply.status(400).send({ success: false, error: 'Invalid counterparty for tenant' });
      if (err.message === 'INVALID_ORDER') return reply.status(400).send({ success: false, error: 'Invalid order for tenant' });
      return reply.status(400).send({ success: false, error: err.message });
    }

    return { success: true, message: 'Return updated' };
  });

  // Confirm — increments stock; if linked to a Counterparty, also
  // decreases their debt (CounterpartyLedger RETURN row). A return with
  // no counterparty is purely a stock movement — any actual refund is
  // handled outside this document (schema.prisma comment).
  fastify.post('/customer-returns/:id/confirm', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const ret = await prisma.customerReturn.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!ret) return reply.status(404).send({ success: false, error: 'Return not found' });
    if (ret.status !== 'DRAFT') return reply.status(400).send({ success: false, error: `Return is already ${ret.status}` });

    try {
      await prisma.$transaction(async (tx: any) => {
        for (const item of ret.items) {
          const product = await tx.product.findFirst({ where: { id: item.productId, tenantId }, select: { stockQty: true } });
          if (!product) throw new Error('PRODUCT_TENANT_MISMATCH');
          const qtyBefore = product.stockQty;
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { increment: item.qty } },
            select: { stockQty: true },
          });

          await tx.stockLedgerEntry.create({
            data: {
              tenantId,
              productId: item.productId,
              variantId: null,
              delta: item.qty,
              reason: 'CUSTOMER_RETURN',
              sourceType: 'CUSTOMER_RETURN',
              sourceId: ret.id,
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              variantId: null,
              delta: item.qty,
              qtyBefore,
              qtyAfter: updated.stockQty,
              note: `Return #${ret.returnNumber} from customer`,
              userId: request.user?.userId,
            },
          });
        }

        if (ret.counterpartyId) {
          const debtDelta = -Math.round(Number(ret.totalCost));
          await tx.counterparty.update({ where: { id: ret.counterpartyId }, data: { currentDebt: { increment: debtDelta } } });
          await tx.counterpartyLedger.create({
            data: {
              tenantId,
              counterpartyId: ret.counterpartyId,
              type: 'RETURN',
              delta: debtDelta,
              orderId: ret.orderId,
              customerReturnId: ret.id,
              note: `Return #${ret.returnNumber}`,
            },
          });
        }

        await tx.customerReturn.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      });
    } catch (err: any) {
      if (err.message === 'PRODUCT_TENANT_MISMATCH') {
        return reply.status(400).send({ success: false, error: 'Product does not belong to tenant' });
      }
      return reply.status(500).send({ success: false, error: 'Failed to confirm return' });
    }

    return { success: true, message: 'Return confirmed, stock updated' };
  });

  async function assertEditable(tx: any, id: string, tenantId: string) {
    const ret = await tx.customerReturn.findFirst({ where: { id, tenantId }, include: { items: true } });
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

  fastify.post('/customer-returns/:id/items', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
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

        const item = await tx.customerReturnItem.create({
          data: { customerReturnId: id, productId: body.productId, qty: body.qty, unitCost: body.unitCost, totalCost: body.qty * body.unitCost },
          include: { product: { select: { id: true, name: true } } },
        });
        const items = await tx.customerReturnItem.findMany({ where: { customerReturnId: id }, select: { totalCost: true } });
        const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
        await tx.customerReturn.update({ where: { id }, data: { totalCost } });
        return { item, totalCost };
      });
      return reply.status(201).send({ success: true, data: result });
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });

  fastify.patch('/customer-returns/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
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
        const item = await tx.customerReturnItem.update({
          where: { id: itemId },
          data: { qty, unitCost, totalCost: qty * unitCost },
          include: { product: { select: { id: true, name: true } } },
        });
        const items = await tx.customerReturnItem.findMany({ where: { customerReturnId: id }, select: { totalCost: true } });
        const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
        await tx.customerReturn.update({ where: { id }, data: { totalCost } });
        return { item, totalCost };
      });
      return { success: true, data: result };
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });

  fastify.delete('/customer-returns/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const tenantId = request.tenantId!;

    try {
      const result = await prisma.$transaction(async (tx: any) => {
        const ret = await assertEditable(tx, id, tenantId);
        const existing = ret.items.find((i: any) => i.id === itemId);
        if (!existing) throw new Error('ITEM_NOT_FOUND');
        if (ret.items.length <= 1) throw new Error('LAST_ITEM');

        await tx.customerReturnItem.delete({ where: { id: itemId } });
        const items = await tx.customerReturnItem.findMany({ where: { customerReturnId: id }, select: { totalCost: true } });
        const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
        await tx.customerReturn.update({ where: { id }, data: { totalCost } });
        return { totalCost };
      });
      return { success: true, data: result };
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });
}
