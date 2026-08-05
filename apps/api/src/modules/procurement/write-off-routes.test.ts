import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    stockWriteOff: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    stockWriteOffItem: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    purchaseOrder: { findFirst: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    stockLedgerEntry: { create: vi.fn() },
    stockMovement: { create: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  permissionGuard: vi.fn((_key: string) => async () => {}),
  planGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));

import stockWriteOffRoutes from './write-off-routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1', role: 'OWNER' };
  });
  await app.register(stockWriteOffRoutes);
  return app;
}

describe('stock-write-off.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('POST /stock-write-offs', () => {
    it('creates a write-off with an advisory-locked sequential writeOffNumber', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        stockWriteOff: {
          findFirst: vi.fn().mockResolvedValue({ writeOffNumber: 3 }),
          create: vi.fn().mockResolvedValue({ id: 'wo-1', writeOffNumber: 4, items: [] }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/stock-write-offs',
        payload: { reason: 'SHORTAGE', items: [{ productId: 'p-1', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.stockWriteOff.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ writeOffNumber: 4, reason: 'SHORTAGE' }) })
      );
      await app.close();
    });

    it('defaults reason to OTHER when omitted', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        stockWriteOff: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'wo-1', writeOffNumber: 1, items: [] }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/stock-write-offs',
        payload: { items: [{ productId: 'p-1', qty: 1, unitCost: 100 }] },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.stockWriteOff.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: 'OTHER' }) })
      );
      await app.close();
    });

    it('rejects an invalid linked purchase order', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/stock-write-offs',
        payload: { purchaseOrderId: 'po-foreign', items: [{ productId: 'p-1', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/purchase order/i);
      await app.close();
    });

    it('rejects a product not belonging to the tenant', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/stock-write-offs',
        payload: { items: [{ productId: 'p-foreign', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/invalid/i);
      await app.close();
    });
  });

  describe('PATCH /stock-write-offs/:id', () => {
    function makePatchTx(wo: any) {
      const tx = { stockWriteOff: { findFirst: vi.fn().mockResolvedValue(wo), update: vi.fn().mockResolvedValue({}) } };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('rejects a direct CONFIRMED transition', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/stock-write-offs/wo-1', payload: { status: 'CONFIRMED' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('allows DRAFT -> CANCELLED', async () => {
      const tx = makePatchTx({ id: 'wo-1', status: 'DRAFT' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/stock-write-offs/wo-1', payload: { status: 'CANCELLED' } });
      expect(response.statusCode).toBe(200);
      expect(tx.stockWriteOff.update).toHaveBeenCalledWith({ where: { id: 'wo-1' }, data: { status: 'CANCELLED' } });
      await app.close();
    });

    it('rejects editing an already-CONFIRMED write-off', async () => {
      makePatchTx({ id: 'wo-1', status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/stock-write-offs/wo-1', payload: { note: 'oops' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /stock-write-offs/:id/confirm', () => {
    const baseWriteOff = {
      id: 'wo-1', status: 'DRAFT', writeOffNumber: 1, reason: 'SHORTAGE', totalCost: 2000, purchaseOrderId: null,
      items: [{ id: 'wi-1', productId: 'p-1', qty: 2, unitCost: 1000 }],
    };

    function makeConfirmTx() {
      const tx = {
        product: { findFirst: vi.fn().mockResolvedValue({ stockQty: 10 }), update: vi.fn().mockResolvedValue({ stockQty: 8 }) },
        stockLedgerEntry: { create: vi.fn().mockResolvedValue({}) },
        stockMovement: { create: vi.fn().mockResolvedValue({}) },
        stockWriteOff: { update: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('decrements stock only — no supplier/counterparty/debt writes', async () => {
      mocks.prisma.stockWriteOff.findFirst.mockResolvedValue(baseWriteOff);
      const tx = makeConfirmTx();

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/stock-write-offs/wo-1/confirm' });

      expect(response.statusCode).toBe(200);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' }, data: { stockQty: { decrement: 2 } }, select: { stockQty: true },
      });
      expect(tx.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-1', delta: -2, reason: 'WRITE_OFF', sourceType: 'STOCK_WRITE_OFF', sourceId: 'wo-1' }),
      });
      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ delta: -2, qtyBefore: 10, qtyAfter: 8 }),
      });
      expect(tx.stockWriteOff.update).toHaveBeenCalledWith({
        where: { id: 'wo-1' }, data: expect.objectContaining({ status: 'CONFIRMED' }),
      });
      expect((tx as any).supplier).toBeUndefined();
      expect((tx as any).supplierLedger).toBeUndefined();
      expect((tx as any).counterparty).toBeUndefined();
      expect((tx as any).counterpartyLedger).toBeUndefined();
      await app.close();
    });

    it('rejects confirming an already-CONFIRMED write-off', async () => {
      mocks.prisma.stockWriteOff.findFirst.mockResolvedValue({ ...baseWriteOff, status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/stock-write-offs/wo-1/confirm' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 400 when a product does not belong to the tenant (rolled back)', async () => {
      mocks.prisma.stockWriteOff.findFirst.mockResolvedValue(baseWriteOff);
      const tx = makeConfirmTx();
      tx.product.findFirst = vi.fn().mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/stock-write-offs/wo-1/confirm' });

      expect(response.statusCode).toBe(400);
      expect(tx.stockWriteOff.update).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('line-item CRUD', () => {
    it('adds an item while DRAFT and recomputes totalCost', async () => {
      const tx = {
        stockWriteOff: { findFirst: vi.fn().mockResolvedValue({ id: 'wo-1', status: 'DRAFT', items: [] }), update: vi.fn().mockResolvedValue({}) },
        product: { findFirst: vi.fn().mockResolvedValue({ id: 'p-2' }) },
        stockWriteOffItem: {
          create: vi.fn().mockResolvedValue({ id: 'wi-new' }),
          findMany: vi.fn().mockResolvedValue([{ totalCost: 500 }]),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/stock-write-offs/wo-1/items',
        payload: { productId: 'p-2', qty: 1, unitCost: 500 },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.totalCost).toBe(500);
      await app.close();
    });

    it('rejects item edits once CONFIRMED', async () => {
      const tx = {
        stockWriteOff: { findFirst: vi.fn().mockResolvedValue({ id: 'wo-1', status: 'CONFIRMED', items: [{ id: 'wi-1' }] }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/stock-write-offs/wo-1/items/wi-1',
        payload: { qty: 5 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('refuses to delete the last remaining item', async () => {
      const tx = {
        stockWriteOff: { findFirst: vi.fn().mockResolvedValue({ id: 'wo-1', status: 'DRAFT', items: [{ id: 'wi-1' }] }) },
        stockWriteOffItem: { delete: vi.fn() },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/stock-write-offs/wo-1/items/wi-1' });

      expect(response.statusCode).toBe(400);
      expect(tx.stockWriteOffItem.delete).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
