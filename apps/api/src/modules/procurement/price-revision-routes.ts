import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { triggerCatalogRefresh } from '../pos-sync/admin-routes.js';

const PRICE_REVISION_STATUS = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;

const priceItemFields = {
  newPrice: z.number().min(0).optional(),
  newPosPrice: z.number().min(0).optional(),
  newWholesalePrice: z.number().min(0).optional(),
};

const createItemSchema = z.object({
  productId: z.string(),
  ...priceItemFields,
}).refine(
  (d) => d.newPrice !== undefined || d.newPosPrice !== undefined || d.newWholesalePrice !== undefined,
  { message: 'At least one of newPrice, newPosPrice, newWholesalePrice must be provided' }
);

const createPriceRevisionSchema = z.object({
  note: z.string().optional(),
  items: z.array(createItemSchema).min(1),
});

const updatePriceRevisionSchema = z.object({
  status: z.enum(PRICE_REVISION_STATUS).optional(),
  note: z.string().optional(),
});

const updateItemSchema = z.object({
  newPrice: z.number().min(0).nullable().optional(),
  newPosPrice: z.number().min(0).nullable().optional(),
  newWholesalePrice: z.number().min(0).nullable().optional(),
});

function snapshotOldPrices(product: { price: any; posPrice: any; wholesalePrice: any }) {
  return {
    oldPrice: product.price,
    oldPosPrice: product.posPrice ?? product.price,
    oldWholesalePrice: product.wholesalePrice ?? product.price,
  };
}

export default async function priceRevisionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  const listQuerySchema = z.object({ status: z.enum(PRICE_REVISION_STATUS).optional() });

  fastify.get('/price-revisions', async (request, reply) => {
    let query: z.infer<typeof listQuerySchema>;
    try {
      query = listQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const where: any = { tenantId: request.tenantId! };
    if (query.status) where.status = query.status;

    const revisions = await prisma.priceRevision.findMany({
      where,
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return { success: true, data: revisions };
  });

  fastify.get('/price-revisions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const revision = await prisma.priceRevision.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
    });
    if (!revision) return reply.status(404).send({ success: false, error: 'Price revision not found' });
    return { success: true, data: revision };
  });

  fastify.post('/price-revisions', { preHandler: [permissionGuard('manageCatalog'), planGuard('procurementEnabled')] }, async (request, reply) => {
    try {
      const body = createPriceRevisionSchema.parse(request.body);
      const tenantId = request.tenantId!;

      const uniqueProductIds = [...new Set(body.items.map((item) => item.productId))];
      const products = await prisma.product.findMany({
        where: { tenantId, id: { in: uniqueProductIds } },
        select: { id: true, price: true, posPrice: true, wholesalePrice: true },
      });
      if (products.length !== uniqueProductIds.length) {
        return reply.status(400).send({ success: false, error: 'One or more products are invalid for tenant' });
      }
      const productById = new Map(products.map((p) => [p.id, p]));

      const revision = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text || ':price-revision'))`;
        const last = await tx.priceRevision.findFirst({ where: { tenantId }, orderBy: { revisionNumber: 'desc' } });
        const revisionNumber = (last?.revisionNumber ?? 0) + 1;
        return tx.priceRevision.create({
          data: {
            tenantId,
            revisionNumber,
            note: body.note,
            items: {
              create: body.items.map((item) => ({
                productId: item.productId,
                ...snapshotOldPrices(productById.get(item.productId)!),
                newPrice: item.newPrice ?? null,
                newPosPrice: item.newPosPrice ?? null,
                newWholesalePrice: item.newWholesalePrice ?? null,
              })),
            },
          },
          include: { items: true },
        });
      });

      return { success: true, data: revision };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/price-revisions/:id', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;
    let body: z.infer<typeof updatePriceRevisionSchema>;
    try {
      body = updatePriceRevisionSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    if (body.status === 'CONFIRMED') {
      return reply.status(400).send({ success: false, error: 'Use POST /confirm to confirm a price revision' });
    }

    try {
      await prisma.$transaction(async (tx: any) => {
        const revision = await tx.priceRevision.findFirst({ where: { id, tenantId } });
        if (!revision) throw new Error('PRICE_REVISION_NOT_FOUND');
        if (revision.status !== 'DRAFT') throw new Error('PRICE_REVISION_LOCKED');

        const data: any = {};
        if (body.status === 'CANCELLED') data.status = 'CANCELLED';
        if (body.note !== undefined) data.note = body.note;

        await tx.priceRevision.update({ where: { id }, data });
      });
    } catch (err: any) {
      if (err.message === 'PRICE_REVISION_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Price revision not found' });
      if (err.message === 'PRICE_REVISION_LOCKED') return reply.status(400).send({ success: false, error: 'This price revision has already been confirmed or cancelled' });
      return reply.status(400).send({ success: false, error: err.message });
    }

    return { success: true, message: 'Price revision updated' };
  });

  // Confirm — for each item, sets Product.price/posPrice/wholesalePrice to
  // whichever new* fields are non-null (an item with all three null is a
  // no-op and is skipped, same spirit as StockCount's uncounted rows).
  // Prices are absolute sets, not deltas, so no ledger entries — the
  // revision's old*/new* pairs are themselves the audit trail. Finishes
  // with triggerCatalogRefresh so POS devices pick up new posPrice values
  // promptly (same hook product/routes.ts's own price edits already use).
  fastify.post('/price-revisions/:id/confirm', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const revision = await prisma.priceRevision.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!revision) return reply.status(404).send({ success: false, error: 'Price revision not found' });
    if (revision.status !== 'DRAFT') return reply.status(400).send({ success: false, error: `Price revision is already ${revision.status}` });

    try {
      await prisma.$transaction(async (tx: any) => {
        for (const item of revision.items) {
          if (item.newPrice === null && item.newPosPrice === null && item.newWholesalePrice === null) continue;

          const product = await tx.product.findFirst({ where: { id: item.productId, tenantId }, select: { id: true } });
          if (!product) throw new Error('PRODUCT_TENANT_MISMATCH');

          const data: any = {};
          if (item.newPrice !== null) data.price = item.newPrice;
          if (item.newPosPrice !== null) data.posPrice = item.newPosPrice;
          if (item.newWholesalePrice !== null) data.wholesalePrice = item.newWholesalePrice;

          await tx.product.update({ where: { id: item.productId }, data });
        }

        await tx.priceRevision.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      });
    } catch (err: any) {
      if (err.message === 'PRODUCT_TENANT_MISMATCH') {
        return reply.status(400).send({ success: false, error: 'Product does not belong to tenant' });
      }
      return reply.status(500).send({ success: false, error: 'Failed to confirm price revision' });
    }

    await triggerCatalogRefresh(tenantId);

    return { success: true, message: 'Price revision confirmed, prices updated' };
  });

  async function assertEditable(tx: any, id: string, tenantId: string) {
    const revision = await tx.priceRevision.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!revision) throw new Error('PRICE_REVISION_NOT_FOUND');
    if (revision.status !== 'DRAFT') throw new Error('PRICE_REVISION_LOCKED');
    return revision;
  }

  function itemCrudErrorReply(reply: any, err: any) {
    if (err.message === 'PRICE_REVISION_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Price revision not found' });
    if (err.message === 'PRICE_REVISION_LOCKED') return reply.status(400).send({ success: false, error: 'This price revision has already been confirmed or cancelled' });
    if (err.message === 'ITEM_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Item not found' });
    if (err.message === 'INVALID_PRODUCT') return reply.status(400).send({ success: false, error: 'Invalid product for tenant' });
    if (err.message === 'LAST_ITEM') return reply.status(400).send({ success: false, error: 'A price revision must have at least one item' });
    return reply.status(400).send({ success: false, error: err.message });
  }

  fastify.post('/price-revisions/:id/items', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;
    let body: z.infer<typeof createItemSchema>;
    try {
      body = createItemSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    try {
      const item = await prisma.$transaction(async (tx: any) => {
        await assertEditable(tx, id, tenantId);
        const product = await tx.product.findFirst({
          where: { id: body.productId, tenantId },
          select: { id: true, price: true, posPrice: true, wholesalePrice: true },
        });
        if (!product) throw new Error('INVALID_PRODUCT');

        return tx.priceRevisionItem.create({
          data: {
            priceRevisionId: id,
            productId: body.productId,
            ...snapshotOldPrices(product),
            newPrice: body.newPrice ?? null,
            newPosPrice: body.newPosPrice ?? null,
            newWholesalePrice: body.newWholesalePrice ?? null,
          },
          include: { product: { select: { id: true, name: true } } },
        });
      });
      return reply.status(201).send({ success: true, data: item });
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });

  fastify.patch('/price-revisions/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
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
        const revision = await assertEditable(tx, id, tenantId);
        const existing = revision.items.find((i: any) => i.id === itemId);
        if (!existing) throw new Error('ITEM_NOT_FOUND');

        const data: any = {};
        if (body.newPrice !== undefined) data.newPrice = body.newPrice;
        if (body.newPosPrice !== undefined) data.newPosPrice = body.newPosPrice;
        if (body.newWholesalePrice !== undefined) data.newWholesalePrice = body.newWholesalePrice;

        return tx.priceRevisionItem.update({
          where: { id: itemId },
          data,
          include: { product: { select: { id: true, name: true } } },
        });
      });
      return { success: true, data: item };
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });

  fastify.delete('/price-revisions/:id/items/:itemId', { preHandler: [permissionGuard('manageCatalog')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const tenantId = request.tenantId!;

    try {
      await prisma.$transaction(async (tx: any) => {
        const revision = await assertEditable(tx, id, tenantId);
        const existing = revision.items.find((i: any) => i.id === itemId);
        if (!existing) throw new Error('ITEM_NOT_FOUND');
        if (revision.items.length <= 1) throw new Error('LAST_ITEM');

        await tx.priceRevisionItem.delete({ where: { id: itemId } });
      });
      return { success: true, message: 'Item removed' };
    } catch (err: any) {
      return itemCrudErrorReply(reply, err);
    }
  });
}
