import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { planGuard } from '../../plugins/plan-guard.js';

const WRITE_OFF_STATUS = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
const WRITE_OFF_REASONS = ['DEFECT', 'DAMAGE', 'SHORTAGE', 'INTERNAL_USE', 'OTHER'] as const;

const createWriteOffSchema = z.object({
  reason: z.enum(WRITE_OFF_REASONS).default('OTHER'),
  purchaseOrderId: z.string().optional(),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    qty: z.number().int().positive(),
    unitCost: z.number().min(0),
  })).min(1),
});

const updateWriteOffSchema = z.object({
  status: z.enum(WRITE_OFF_STATUS).optional(),
  reason: z.enum(WRITE_OFF_REASONS).optional(),
  purchaseOrderId: z.string().nullable().optional(),
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

export default async function stockWriteOffRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  const listQuerySchema = z.object({ status: z.enum(WRITE_OFF_STATUS).optional() });

  fastify.get('/stock-write-offs', async (request, reply) => {
    let query: z.infer<typeof listQuerySchema>;
    try {
      query = listQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const where: any = { tenantId: request.tenantId! };
    if (query.status) where.status = query.status;

    const writeOffs = await prisma.stockWriteOff.findMany({
      where,
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return { success: true, data: writeOffs };
  });

  fastify.get('/stock-write-offs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const wo = await prisma.stockWriteOff.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
    });
    if (!wo) return reply.status(404).send({ success: false, error: 'Write-off not found' });
    return { success: true, data: wo };
  });

  fastify.post('/stock-write-offs', { preHandler: [permissionGuard('manageCatalog'), planGuard('procurementEnabled')] }, async (request, reply) => {
    try {
      const body = createWriteOffSchema.parse(request.body);
      const tenantId = request.tenantId!;

      if (body.purchaseOrderId) {
        const po = await prisma.purchaseOrder.findFirst({ where: { id: body.purchaseOrderId, tenantId }, select: { id: true, status: true } });
        if (!po) return reply.status(400).send({ success: false, error: 'Invalid purchase order for tenant' });
        // Same reasoning as SupplierReturn — "these arrived damaged, see
        // PO-X" only makes sense once the shipment has actually arrived.
        if (po.status !== 'RECEIVED') return reply.status(400).send({ success: false, error: 'Can only link a write-off to a received purchase order' });
      }

      const uniqueProductIds = [...new Set(body.items.map((item) => item.productId))];
      const ownedProducts = await prisma.product.findMany({ where: { tenantId, id: { in: uniqueProductIds } }, select: { id: true } });
      if (ownedProducts.length !== uniqueProductIds.length) {
        return reply.status(400).send({ success: false, error: 'One or more products are invalid for tenant' });
      }

      const totalCost = body.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);

      const wo = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text || ':write-off'))`;
        const last = await tx.stockWriteOff.findFirst({ where: { tenantId }, orderBy: { writeOffNumber: 'desc' } });
        const writeOffNumber = (last?.writeOffNumber ?? 0) + 1;
        return tx.stockWriteOff.create({
          data: {
            tenantId,
            writeOffNumber,
            reason: body.reason,
            purchaseOrderId: body.purchaseOrderId ?? null,
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

      return { success: true, data: wo };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/stock-write-offs/:id', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;
    let body: z.infer<typeof updateWriteOffSchema>;
    try {
      body = updateWriteOffSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    if (body.status === 'CONFIRMED') {
      return reply.status(400).send({ success: false, error: 'Use POST /confirm to confirm a write-off' });
    }

    try {
      await prisma.$transaction(async (tx: any) => {
        const wo = await tx.stockWriteOff.findFirst({ where: { id, tenantId } });
        if (!wo) throw new Error('WRITE_OFF_NOT_FOUND');
        if (wo.status !== 'DRAFT') throw new Error('WRITE_OFF_LOCKED');

        if (body.purchaseOrderId) {
          const po = await tx.purchaseOrder.findFirst({ where: { id: body.purchaseOrderId, tenantId }, select: { id: true, status: true } });
          if (!po) throw new Error('INVALID_PURCHASE_ORDER');
          if (po.status !== 'RECEIVED') throw new Error('PURCHASE_ORDER_NOT_RECEIVED');
        }

        const data: any = {};
        if (body.status === 'CANCELLED') data.status = 'CANCELLED';
        if (body.reason !== undefined) data.reason = body.reason;
        if (body.purchaseOrderId !== undefined) data.purchaseOrderId = body.purchaseOrderId;
        if (body.note !== undefined) data.note = body.note;

        await tx.stockWriteOff.update({ where: { id }, data });
      });
    } catch (err: any) {
      if (err.message === 'WRITE_OFF_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Write-off not found' });
      if (err.message === 'WRITE_OFF_LOCKED') return reply.status(400).send({ success: false, error: 'This write-off has already been confirmed or cancelled' });
      if (err.message === 'INVALID_PURCHASE_ORDER') return reply.status(400).send({ success: false, error: 'Invalid purchase order for tenant' });
      if (err.message === 'PURCHASE_ORDER_NOT_RECEIVED') return reply.status(400).send({ success: false, error: 'Can only link a write-off to a received purchase order' });
      return reply.status(400).send({ success: false, error: err.message });
    }

    return { success: true, message: 'Write-off updated' };
  });

  // Confirm — decrements stock only, no supplier/counterparty/debt
  // involved at all (docs/schema.prisma comment on StockWriteOff).
  fastify.post('/stock-write-offs/:id/confirm', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const wo = await prisma.stockWriteOff.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!wo) return reply.status(404).send({ success: false, error: 'Write-off not found' });
    if (wo.status !== 'DRAFT') return reply.status(400).send({ success: false, error: `Write-off is already ${wo.status}` });

    try {
      await prisma.$transaction(async (tx: any) => {
        for (const item of wo.items) {
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
              reason: 'WRITE_OFF',
              sourceType: 'STOCK_WRITE_OFF',
              sourceId: wo.id,
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
              note: `Write-off #${wo.writeOffNumber} (${wo.reason})`,
              userId: request.user?.userId,
            },
          });
        }

        await tx.stockWriteOff.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      });
    } catch (err: any) {
      if (err.message === 'PRODUCT_TENANT_MISMATCH') {
        return reply.status(400).send({ success: false, error: 'Product does not belong to tenant' });
      }
      return reply.status(500).send({ success: false, error: 'Failed to confirm write-off' });
    }

    return { success: true, message: 'Write-off confirmed, stock updated' };
  });

  async function assertEditable(tx: any, id: string, tenantId: string) {
    const wo = await tx.stockWriteOff.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!wo) throw new Error('WRITE_OFF_NOT_FOUND');
    if (wo.status !== 'DRAFT') throw new Error('WRITE_OFF_LOCKED');
    return wo;
  }

  function itemCrudErrorReply(reply: any, err: any) {
    if (err.message === 'WRITE_OFF_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Write-off not found' });
    if (err.message === 'WRITE_OFF_LOCKED') return reply.status(400).send({ success: false, error: 'This write-off has already been confirmed or cancelled' });
    if (err.message === 'ITEM_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Item not found' });
    if (err.message === 'INVALID_PRODUCT') return reply.status(400).send({ success: false, error: 'Invalid product for tenant' });
    if (err.message === 'LAST_ITEM') return reply.status(400).send({ success: false, error: 'A write-off must have at least one item' });
    return reply.status(400).send({ success: false, error: err.message });
  }

  fastify.post('/stock-write-offs/:id/items', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
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

        const item = await tx.stockWriteOffItem.create({
          data: { stockWriteOffId: id, productId: body.productId, qty: body.qty, unitCost: body.unitCost, totalCost: body.qty * body.unitCost },
          include: { product: { select: { id: true, name: true } } },
        });
        const items = await tx.stockWriteOffItem.findMany({ where: { stockWriteOffId: id }, select: { totalCost: true } });
        const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
        await tx.stockWriteOff.update({ where: { id }, data: { totalCost } });
        return { item, totalCost };
      });
      return reply.status(201).send({ success: true, data: result });
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });

  fastify.patch('/stock-write-offs/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
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
        const wo = await assertEditable(tx, id, tenantId);
        const existing = wo.items.find((i: any) => i.id === itemId);
        if (!existing) throw new Error('ITEM_NOT_FOUND');

        const qty = body.qty ?? existing.qty;
        const unitCost = body.unitCost ?? Number(existing.unitCost);
        const item = await tx.stockWriteOffItem.update({
          where: { id: itemId },
          data: { qty, unitCost, totalCost: qty * unitCost },
          include: { product: { select: { id: true, name: true } } },
        });
        const items = await tx.stockWriteOffItem.findMany({ where: { stockWriteOffId: id }, select: { totalCost: true } });
        const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
        await tx.stockWriteOff.update({ where: { id }, data: { totalCost } });
        return { item, totalCost };
      });
      return { success: true, data: result };
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });

  fastify.delete('/stock-write-offs/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const tenantId = request.tenantId!;

    try {
      const result = await prisma.$transaction(async (tx: any) => {
        const wo = await assertEditable(tx, id, tenantId);
        const existing = wo.items.find((i: any) => i.id === itemId);
        if (!existing) throw new Error('ITEM_NOT_FOUND');
        if (wo.items.length <= 1) throw new Error('LAST_ITEM');

        await tx.stockWriteOffItem.delete({ where: { id: itemId } });
        const items = await tx.stockWriteOffItem.findMany({ where: { stockWriteOffId: id }, select: { totalCost: true } });
        const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.totalCost), 0);
        await tx.stockWriteOff.update({ where: { id }, data: { totalCost } });
        return { totalCost };
      });
      return { success: true, data: result };
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });
}
