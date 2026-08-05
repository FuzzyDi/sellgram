import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

const STOCK_COUNT_STATUS = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;

const createStockCountSchema = z.object({
  note: z.string().optional(),
});

const updateStockCountSchema = z.object({
  status: z.enum(STOCK_COUNT_STATUS).optional(),
  note: z.string().optional(),
});

const updateItemSchema = z.object({
  countedQty: z.number().int().min(0).nullable(),
});

export default async function stockCountRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  const listQuerySchema = z.object({ status: z.enum(STOCK_COUNT_STATUS).optional() });

  fastify.get('/stock-counts', async (request, reply) => {
    let query: z.infer<typeof listQuerySchema>;
    try {
      query = listQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const where: any = { tenantId: request.tenantId! };
    if (query.status) where.status = query.status;

    const counts = await prisma.stockCount.findMany({
      where,
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return { success: true, data: counts };
  });

  fastify.get('/stock-counts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const count = await prisma.stockCount.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
    });
    if (!count) return reply.status(404).send({ success: false, error: 'Stock count not found' });
    return { success: true, data: count };
  });

  // Create — snapshots every non-deleted product's current stockQty as
  // expectedQty; countedQty starts null (uncounted). No item picker: the
  // whole point is a full-catalog snapshot taken at one instant.
  fastify.post('/stock-counts', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    try {
      const body = createStockCountSchema.parse(request.body);
      const tenantId = request.tenantId!;

      const products = await prisma.product.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, stockQty: true },
      });
      if (products.length === 0) {
        return reply.status(400).send({ success: false, error: 'No products to count' });
      }

      const count = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text || ':stock-count'))`;
        const last = await tx.stockCount.findFirst({ where: { tenantId }, orderBy: { countNumber: 'desc' } });
        const countNumber = (last?.countNumber ?? 0) + 1;
        return tx.stockCount.create({
          data: {
            tenantId,
            countNumber,
            note: body.note,
            items: {
              create: products.map((p: any) => ({
                productId: p.id,
                expectedQty: p.stockQty,
                countedQty: null,
              })),
            },
          },
          include: { items: true },
        });
      });

      return { success: true, data: count };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/stock-counts/:id', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;
    let body: z.infer<typeof updateStockCountSchema>;
    try {
      body = updateStockCountSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    if (body.status === 'CONFIRMED') {
      return reply.status(400).send({ success: false, error: 'Use POST /confirm to confirm a stock count' });
    }

    try {
      await prisma.$transaction(async (tx: any) => {
        const count = await tx.stockCount.findFirst({ where: { id, tenantId } });
        if (!count) throw new Error('STOCK_COUNT_NOT_FOUND');
        if (count.status !== 'DRAFT') throw new Error('STOCK_COUNT_LOCKED');

        const data: any = {};
        if (body.status === 'CANCELLED') data.status = 'CANCELLED';
        if (body.note !== undefined) data.note = body.note;

        await tx.stockCount.update({ where: { id }, data });
      });
    } catch (err: any) {
      if (err.message === 'STOCK_COUNT_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Stock count not found' });
      if (err.message === 'STOCK_COUNT_LOCKED') return reply.status(400).send({ success: false, error: 'This stock count has already been confirmed or cancelled' });
      return reply.status(400).send({ success: false, error: err.message });
    }

    return { success: true, message: 'Stock count updated' };
  });

  fastify.patch('/stock-counts/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
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
        const count = await tx.stockCount.findFirst({ where: { id, tenantId }, include: { items: true } });
        if (!count) throw new Error('STOCK_COUNT_NOT_FOUND');
        if (count.status !== 'DRAFT') throw new Error('STOCK_COUNT_LOCKED');
        const existing = count.items.find((i: any) => i.id === itemId);
        if (!existing) throw new Error('ITEM_NOT_FOUND');

        return tx.stockCountItem.update({
          where: { id: itemId },
          data: { countedQty: body.countedQty },
          include: { product: { select: { id: true, name: true } } },
        });
      });
      return { success: true, data: item };
    } catch (err: any) {
      if (err.message === 'STOCK_COUNT_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Stock count not found' });
      if (err.message === 'STOCK_COUNT_LOCKED') return reply.status(400).send({ success: false, error: 'This stock count has already been confirmed or cancelled' });
      if (err.message === 'ITEM_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Item not found' });
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Confirm — for every item where countedQty was entered and differs
  // from expectedQty, applies the discrepancy as a relative delta on top
  // of *current* stockQty (not an absolute overwrite — see schema.prisma
  // comment). Uncounted rows (countedQty: null) are treated as matching
  // and skipped.
  fastify.post('/stock-counts/:id/confirm', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const count = await prisma.stockCount.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!count) return reply.status(404).send({ success: false, error: 'Stock count not found' });
    if (count.status !== 'DRAFT') return reply.status(400).send({ success: false, error: `Stock count is already ${count.status}` });

    try {
      await prisma.$transaction(async (tx: any) => {
        for (const item of count.items) {
          if (item.countedQty === null || item.countedQty === item.expectedQty) continue;
          const delta = item.countedQty - item.expectedQty;

          const product = await tx.product.findFirst({ where: { id: item.productId, tenantId }, select: { stockQty: true } });
          if (!product) throw new Error('PRODUCT_TENANT_MISMATCH');
          const qtyBefore = product.stockQty;
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { increment: delta } },
            select: { stockQty: true },
          });

          await tx.stockLedgerEntry.create({
            data: {
              tenantId,
              productId: item.productId,
              variantId: null,
              delta,
              reason: 'STOCKTAKE',
              sourceType: 'STOCK_COUNT',
              sourceId: count.id,
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              variantId: null,
              delta,
              qtyBefore,
              qtyAfter: updated.stockQty,
              note: `Инвентаризация #${count.countNumber}`,
              userId: request.user?.userId,
            },
          });
        }

        await tx.stockCount.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      });
    } catch (err: any) {
      if (err.message === 'PRODUCT_TENANT_MISMATCH') {
        return reply.status(400).send({ success: false, error: 'Product does not belong to tenant' });
      }
      return reply.status(500).send({ success: false, error: 'Failed to confirm stock count' });
    }

    return { success: true, message: 'Stock count confirmed, discrepancies applied' };
  });
}
