import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    purchaseOrder: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    purchaseOrderItem: { update: vi.fn() },
    product: { findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  planGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));

import procurementRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1' };
  });
  await app.register(procurementRoutes);
  return app;
}

describe('procurement.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── CREATE PO: advisory lock ────────────────────────────────────────────

  describe('POST /purchase-orders', () => {
    it('acquires advisory lock before reading last poNumber', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const callOrder: string[] = [];
      const tx = {
        $executeRaw: vi.fn().mockImplementation(async () => { callOrder.push('lock'); return 1; }),
        purchaseOrder: {
          findFirst: vi.fn().mockImplementation(async () => { callOrder.push('findFirst'); return null; }),
          create: vi.fn().mockResolvedValue({ id: 'po-1', items: [] }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders',
        payload: {
          supplierName: 'Supplier A',
          items: [{ productId: 'p-1', qty: 10, unitCost: 5000 }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(callOrder[0]).toBe('lock');
      expect(callOrder[1]).toBe('findFirst');
      await app.close();
    });

    it('assigns poNumber = lastPO.poNumber + 1', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        purchaseOrder: {
          findFirst: vi.fn().mockResolvedValue({ poNumber: 7 }),
          create: vi.fn().mockResolvedValue({ id: 'po-1', items: [] }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/purchase-orders',
        payload: {
          supplierName: 'Supplier A',
          items: [{ productId: 'p-1', qty: 5, unitCost: 10000 }],
        },
      });

      expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ poNumber: 8 }) })
      );
      await app.close();
    });

    it('rejects with 400 when product does not belong to tenant', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([]); // 0 owned, but 1 requested

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders',
        payload: {
          supplierName: 'Supplier A',
          items: [{ productId: 'p-foreign', qty: 1, unitCost: 1000 }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/invalid/i);
      await app.close();
    });
  });

  // ─── PATCH PO: status validation ─────────────────────────────────────────

  describe('PATCH /purchase-orders/:id', () => {
    it('rejects invalid status string', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { status: 'FLYING' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/invalid status/i);
      await app.close();
    });

    it('blocks direct transition to RECEIVED', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { status: 'RECEIVED' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/\/receive/i);
      await app.close();
    });

    it('rejects illegal transition DRAFT → IN_TRANSIT', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1', status: 'DRAFT' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { status: 'IN_TRANSIT' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('DRAFT');
      await app.close();
    });

    it('allows valid transition DRAFT → ORDERED', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1', status: 'DRAFT' });
      mocks.prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { status: 'ORDERED' },
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('allows ORDERED → CANCELLED', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1', status: 'ORDERED' });
      mocks.prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { status: 'CANCELLED' },
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('rejects from RECEIVED (terminal state)', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1', status: 'RECEIVED' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { status: 'ORDERED' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  // ─── POST /receive: transaction atomicity ────────────────────────────────

  describe('POST /purchase-orders/:id/receive', () => {
    const basePO = {
      id: 'po-1',
      status: 'IN_TRANSIT',
      fxRate: 1,
      shippingCost: 0,
      customsCost: 0,
      items: [{ id: 'poi-1', productId: 'p-1', totalCost: 50000, qty: 10 }],
    };

    it('wraps all updates in a single transaction', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(basePO);
      const tx = {
        purchaseOrderItem: { update: vi.fn().mockResolvedValue({}) },
        product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        purchaseOrder: { update: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/receive',
        payload: { items: [{ itemId: 'poi-1', qtyReceived: 10 }] },
      });

      expect(response.statusCode).toBe(200);
      // All three writes happened inside the same transaction callback
      expect(tx.purchaseOrderItem.update).toHaveBeenCalledTimes(1);
      expect(tx.product.updateMany).toHaveBeenCalledTimes(2); // stock + costPrice
      expect(tx.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RECEIVED' }) })
      );
      // The outer prisma was NOT used directly
      expect(mocks.prisma.purchaseOrderItem.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when product does not belong to tenant (rolled back)', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(basePO);
      const tx = {
        purchaseOrderItem: { update: vi.fn().mockResolvedValue({}) },
        product: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, // tenant mismatch
        purchaseOrder: { update: vi.fn() },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/receive',
        payload: { items: [{ itemId: 'poi-1', qtyReceived: 5 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/tenant/i);
      // PO status was never updated because transaction threw
      expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects already-received PO', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ ...basePO, status: 'RECEIVED' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/receive',
        payload: { items: [] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('RECEIVED');
      await app.close();
    });
  });
});
