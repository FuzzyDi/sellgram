import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    stockCount: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    stockCountItem: { update: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    stockLedgerEntry: { create: vi.fn() },
    stockMovement: { create: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  permissionGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import stockCountRoutes from './stock-count-routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1', role: 'OWNER' };
  });
  await app.register(stockCountRoutes);
  return app;
}

describe('stock-count.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('POST /stock-counts', () => {
    it('snapshots every non-deleted product as a count item with null countedQty', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', stockQty: 10 },
        { id: 'p-2', stockQty: 0 },
      ]);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        stockCount: {
          findFirst: vi.fn().mockResolvedValue({ countNumber: 2 }),
          create: vi.fn().mockResolvedValue({ id: 'sc-1', countNumber: 3, items: [] }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/stock-counts', payload: {} });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.product.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', deletedAt: null },
        select: { id: true, stockQty: true },
      });
      expect(tx.stockCount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            countNumber: 3,
            items: {
              create: [
                { productId: 'p-1', expectedQty: 10, countedQty: null },
                { productId: 'p-2', expectedQty: 0, countedQty: null },
              ],
            },
          }),
        })
      );
      await app.close();
    });

    it('rejects when the tenant has no products to count', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/stock-counts', payload: {} });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/no products/i);
      await app.close();
    });
  });

  describe('PATCH /stock-counts/:id', () => {
    function makePatchTx(count: any) {
      const tx = { stockCount: { findFirst: vi.fn().mockResolvedValue(count), update: vi.fn().mockResolvedValue({}) } };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('rejects a direct CONFIRMED transition', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/stock-counts/sc-1', payload: { status: 'CONFIRMED' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('allows DRAFT -> CANCELLED', async () => {
      const tx = makePatchTx({ id: 'sc-1', status: 'DRAFT' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/stock-counts/sc-1', payload: { status: 'CANCELLED' } });
      expect(response.statusCode).toBe(200);
      expect(tx.stockCount.update).toHaveBeenCalledWith({ where: { id: 'sc-1' }, data: { status: 'CANCELLED' } });
      await app.close();
    });

    it('rejects editing an already-CONFIRMED count', async () => {
      makePatchTx({ id: 'sc-1', status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/stock-counts/sc-1', payload: { note: 'oops' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('PATCH /stock-counts/:id/items/:itemId', () => {
    it('sets countedQty while DRAFT', async () => {
      const tx = {
        stockCount: { findFirst: vi.fn().mockResolvedValue({ id: 'sc-1', status: 'DRAFT', items: [{ id: 'sci-1' }] }) },
        stockCountItem: { update: vi.fn().mockResolvedValue({ id: 'sci-1', countedQty: 7 }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/stock-counts/sc-1/items/sci-1', payload: { countedQty: 7 } });

      expect(response.statusCode).toBe(200);
      expect(tx.stockCountItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sci-1' }, data: { countedQty: 7 } })
      );
      await app.close();
    });

    it('rejects editing an item once the count is CONFIRMED', async () => {
      const tx = {
        stockCount: { findFirst: vi.fn().mockResolvedValue({ id: 'sc-1', status: 'CONFIRMED', items: [{ id: 'sci-1' }] }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/stock-counts/sc-1/items/sci-1', payload: { countedQty: 7 } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /stock-counts/:id/confirm', () => {
    const baseCount = {
      id: 'sc-1', status: 'DRAFT', countNumber: 1,
      items: [
        { id: 'sci-1', productId: 'p-1', expectedQty: 10, countedQty: 8 },  // shortage: delta -2
        { id: 'sci-2', productId: 'p-2', expectedQty: 5, countedQty: 5 },   // matches: skipped
        { id: 'sci-3', productId: 'p-3', expectedQty: 3, countedQty: null }, // uncounted: skipped
      ],
    };

    function makeConfirmTx() {
      const tx = {
        product: { findFirst: vi.fn().mockResolvedValue({ stockQty: 10 }), update: vi.fn().mockResolvedValue({ stockQty: 8 }) },
        stockLedgerEntry: { create: vi.fn().mockResolvedValue({}) },
        stockMovement: { create: vi.fn().mockResolvedValue({}) },
        stockCount: { update: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('applies a delta only for the discrepant, counted item — skips matching and uncounted rows', async () => {
      mocks.prisma.stockCount.findFirst.mockResolvedValue(baseCount);
      const tx = makeConfirmTx();

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/stock-counts/sc-1/confirm' });

      expect(response.statusCode).toBe(200);
      expect(tx.product.update).toHaveBeenCalledTimes(1);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' }, data: { stockQty: { increment: -2 } }, select: { stockQty: true },
      });
      expect(tx.stockLedgerEntry.create).toHaveBeenCalledTimes(1);
      expect(tx.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-1', delta: -2, reason: 'STOCKTAKE', sourceType: 'STOCK_COUNT', sourceId: 'sc-1' }),
      });
      expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
      expect(tx.stockCount.update).toHaveBeenCalledWith({
        where: { id: 'sc-1' }, data: expect.objectContaining({ status: 'CONFIRMED' }),
      });
      await app.close();
    });

    it('rejects confirming an already-CONFIRMED count', async () => {
      mocks.prisma.stockCount.findFirst.mockResolvedValue({ ...baseCount, status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/stock-counts/sc-1/confirm' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 400 when a product does not belong to the tenant (rolled back)', async () => {
      mocks.prisma.stockCount.findFirst.mockResolvedValue(baseCount);
      const tx = makeConfirmTx();
      tx.product.findFirst = vi.fn().mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/stock-counts/sc-1/confirm' });

      expect(response.statusCode).toBe(400);
      expect(tx.stockCount.update).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
