import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    supplier: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    supplierLedger: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
  planGuard: vi.fn((_key: string) => async () => {}),
  permissionGuard: vi.fn((_key: string) => async () => {}),
  writeAuditLog: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));
vi.mock('../../lib/audit.js', () => ({ writeAuditLog: mocks.writeAuditLog }));

import supplierRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1' };
  });
  await app.register(supplierRoutes);
  return app;
}

describe('supplier.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(mocks.prisma));
  });

  describe('GET /suppliers', () => {
    it('lists active suppliers for the tenant', async () => {
      mocks.prisma.supplier.findMany.mockResolvedValue([{ id: 's-1', name: 'Acme', currentDebt: '0' }]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/suppliers' });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.supplier.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', isActive: true },
        orderBy: { name: 'asc' },
      });
      await app.close();
    });
  });

  describe('POST /suppliers', () => {
    it('creates a supplier', async () => {
      mocks.prisma.supplier.create.mockResolvedValue({ id: 's-1', name: 'Acme' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/suppliers',
        payload: { name: 'Acme' },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.supplier.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', name: 'Acme' },
      });
      await app.close();
    });

    it('rejects an empty name (Zod)', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/suppliers', payload: { name: '' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /suppliers/:id/payments', () => {
    it('records the payment and decrements currentDebt', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 's-1' });
      const tx = {
        supplier: { update: vi.fn().mockResolvedValue({ currentDebt: '5000.00' }) },
        supplierLedger: { create: vi.fn().mockResolvedValue({ id: 'ledger-1' }) },
      };
      mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/suppliers/s-1/payments',
        payload: { amount: 5000, note: 'Wired the balance' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.currentDebt).toBe('5000.00');
      expect(tx.supplier.update).toHaveBeenCalledWith({
        where: { id: 's-1' },
        data: { currentDebt: { decrement: 5000 } },
        select: { currentDebt: true },
      });
      expect(tx.supplierLedger.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          supplierId: 's-1',
          type: 'PAYMENT_MADE',
          delta: -5000,
          purchaseOrderId: null,
          note: 'Wired the balance',
        },
      });
      await app.close();
    });

    it('allows overpayment — currentDebt is allowed to go negative', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 's-1' });
      const tx = {
        supplier: { update: vi.fn().mockResolvedValue({ currentDebt: '-2000.00' }) },
        supplierLedger: { create: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/suppliers/s-1/payments',
        payload: { amount: 10000 },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.currentDebt).toBe('-2000.00');
      await app.close();
    });

    it.each([
      ['zero', 0],
      ['negative', -100],
    ])('returns 400 for a %s amount', async (_label, amount) => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/suppliers/s-1/payments',
        payload: { amount },
      });

      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 for a supplier belonging to another tenant', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/suppliers/s-foreign/payments',
        payload: { amount: 1000 },
      });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('POST /suppliers/:id/adjustments', () => {
    it('applies a positive adjustment and writes an audit log', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 's-1', currentDebt: '1000.00' });
      const tx = {
        supplier: { update: vi.fn().mockResolvedValue({ currentDebt: '1500.00' }) },
        supplierLedger: { create: vi.fn().mockResolvedValue({ id: 'ledger-1' }) },
      };
      mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/suppliers/s-1/adjustments',
        payload: { delta: 500, note: 'Invoice correction' },
      });

      expect(response.statusCode).toBe(201);
      expect(tx.supplier.update).toHaveBeenCalledWith({
        where: { id: 's-1' },
        data: { currentDebt: { increment: 500 } },
        select: { currentDebt: true },
      });
      expect(tx.supplierLedger.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', supplierId: 's-1', type: 'ADJUSTMENT', delta: 500, purchaseOrderId: null, note: 'Invoice correction' },
      });
      expect(mocks.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'procurement.debt.adjusted', targetId: 's-1' })
      );
      await app.close();
    });

    it('rejects a zero delta (Zod)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/suppliers/s-1/adjustments',
        payload: { delta: 0, note: 'no-op' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects a missing note (Zod)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/suppliers/s-1/adjustments',
        payload: { delta: 100 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('GET /suppliers/:id/ledger', () => {
    it('returns paginated ledger entries', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 's-1' });
      mocks.prisma.supplierLedger.findMany.mockResolvedValue([{ id: 'l-1' }]);
      mocks.prisma.supplierLedger.count.mockResolvedValue(1);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/suppliers/s-1/ledger' });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.total).toBe(1);
      expect(mocks.prisma.supplierLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { supplierId: 's-1' } })
      );
      await app.close();
    });

    it('returns 404 for a supplier belonging to another tenant', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/suppliers/s-foreign/ledger' });

      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });
});
