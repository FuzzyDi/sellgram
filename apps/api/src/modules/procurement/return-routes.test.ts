import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    supplierReturn: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    supplierReturnItem: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    supplier: { findFirst: vi.fn(), update: vi.fn() },
    purchaseOrder: { findFirst: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    stockLedgerEntry: { create: vi.fn() },
    stockMovement: { create: vi.fn() },
    supplierLedger: { create: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  planGuard: vi.fn((_key: string) => async () => {}),
  permissionGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import supplierReturnRoutes from './return-routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1', role: 'OWNER' };
  });
  await app.register(supplierReturnRoutes);
  return app;
}

describe('supplier-return.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('POST /supplier-returns', () => {
    it('creates a return with an advisory-locked sequential returnNumber', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1' });
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        supplierReturn: {
          findFirst: vi.fn().mockResolvedValue({ returnNumber: 3 }),
          create: vi.fn().mockResolvedValue({ id: 'ret-1', returnNumber: 4, items: [] }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/supplier-returns',
        payload: { supplierId: 'sup-1', items: [{ productId: 'p-1', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.supplierReturn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ returnNumber: 4, supplierId: 'sup-1' }) })
      );
      await app.close();
    });

    it('rejects a supplier not belonging to the tenant', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/supplier-returns',
        payload: { supplierId: 'sup-foreign', items: [{ productId: 'p-1', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/supplier/i);
      await app.close();
    });

    it('rejects an invalid linked purchase order', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1' });
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/supplier-returns',
        payload: { supplierId: 'sup-1', purchaseOrderId: 'po-foreign', items: [{ productId: 'p-1', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/purchase order/i);
      await app.close();
    });

    it('rejects a linked purchase order that has not been received yet', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1' });
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1', status: 'IN_TRANSIT' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/supplier-returns',
        payload: { supplierId: 'sup-1', purchaseOrderId: 'po-1', items: [{ productId: 'p-1', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/received/i);
      await app.close();
    });

    it('rejects a product not belonging to the tenant', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1' });
      mocks.prisma.product.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/supplier-returns',
        payload: { supplierId: 'sup-1', items: [{ productId: 'p-foreign', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/invalid/i);
      await app.close();
    });
  });

  describe('PATCH /supplier-returns/:id', () => {
    function makePatchTx(ret: any) {
      const tx = { supplierReturn: { findFirst: vi.fn().mockResolvedValue(ret), update: vi.fn().mockResolvedValue({}) } };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('rejects a direct CONFIRMED transition', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/supplier-returns/ret-1', payload: { status: 'CONFIRMED' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('allows DRAFT -> CANCELLED', async () => {
      const tx = makePatchTx({ id: 'ret-1', status: 'DRAFT' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/supplier-returns/ret-1', payload: { status: 'CANCELLED' } });
      expect(response.statusCode).toBe(200);
      expect(tx.supplierReturn.update).toHaveBeenCalledWith({ where: { id: 'ret-1' }, data: { status: 'CANCELLED' } });
      await app.close();
    });

    it('rejects editing an already-CONFIRMED return', async () => {
      makePatchTx({ id: 'ret-1', status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/supplier-returns/ret-1', payload: { note: 'oops' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects linking to a purchase order that has not been received yet', async () => {
      const tx = makePatchTx({ id: 'ret-1', status: 'DRAFT' });
      (tx as any).purchaseOrder = { findFirst: vi.fn().mockResolvedValue({ id: 'po-1', status: 'ORDERED' }) };
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/supplier-returns/ret-1', payload: { purchaseOrderId: 'po-1' } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/received/i);
      await app.close();
    });
  });

  describe('POST /supplier-returns/:id/confirm', () => {
    const baseReturn = {
      id: 'ret-1', status: 'DRAFT', returnNumber: 1, supplierId: 'sup-1', fxRate: 1, totalCost: 2000, purchaseOrderId: null,
      items: [{ id: 'ri-1', productId: 'p-1', qty: 2, unitCost: 1000 }],
    };

    function makeConfirmTx() {
      const tx = {
        product: { findFirst: vi.fn().mockResolvedValue({ stockQty: 10 }), update: vi.fn().mockResolvedValue({ stockQty: 8 }) },
        stockLedgerEntry: { create: vi.fn().mockResolvedValue({}) },
        stockMovement: { create: vi.fn().mockResolvedValue({}) },
        supplier: { update: vi.fn().mockResolvedValue({}) },
        supplierLedger: { create: vi.fn().mockResolvedValue({}) },
        supplierReturn: { update: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('decrements stock and supplier debt atomically, with linked ledger rows', async () => {
      mocks.prisma.supplierReturn.findFirst.mockResolvedValue(baseReturn);
      const tx = makeConfirmTx();

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/supplier-returns/ret-1/confirm' });

      expect(response.statusCode).toBe(200);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' }, data: { stockQty: { decrement: 2 } }, select: { stockQty: true },
      });
      expect(tx.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-1', delta: -2, reason: 'SUPPLIER_RETURN', sourceType: 'SUPPLIER_RETURN', sourceId: 'ret-1' }),
      });
      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ delta: -2, qtyBefore: 10, qtyAfter: 8 }),
      });
      expect(tx.supplier.update).toHaveBeenCalledWith({
        where: { id: 'sup-1' }, data: { currentDebt: { increment: -2000 } },
      });
      expect(tx.supplierLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ supplierId: 'sup-1', type: 'RETURN', delta: -2000, supplierReturnId: 'ret-1' }),
      });
      expect(tx.supplierReturn.update).toHaveBeenCalledWith({
        where: { id: 'ret-1' }, data: expect.objectContaining({ status: 'CONFIRMED' }),
      });
      await app.close();
    });

    it('rejects confirming an already-CONFIRMED return', async () => {
      mocks.prisma.supplierReturn.findFirst.mockResolvedValue({ ...baseReturn, status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/supplier-returns/ret-1/confirm' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 400 when a product does not belong to the tenant (rolled back)', async () => {
      mocks.prisma.supplierReturn.findFirst.mockResolvedValue(baseReturn);
      const tx = makeConfirmTx();
      tx.product.findFirst = vi.fn().mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/supplier-returns/ret-1/confirm' });

      expect(response.statusCode).toBe(400);
      expect(tx.supplierReturn.update).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('line-item CRUD', () => {
    it('adds an item while DRAFT and recomputes totalCost', async () => {
      const tx = {
        supplierReturn: { findFirst: vi.fn().mockResolvedValue({ id: 'ret-1', status: 'DRAFT', items: [] }), update: vi.fn().mockResolvedValue({}) },
        product: { findFirst: vi.fn().mockResolvedValue({ id: 'p-2' }) },
        supplierReturnItem: {
          create: vi.fn().mockResolvedValue({ id: 'ri-new' }),
          findMany: vi.fn().mockResolvedValue([{ totalCost: 500 }]),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/supplier-returns/ret-1/items',
        payload: { productId: 'p-2', qty: 1, unitCost: 500 },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.totalCost).toBe(500);
      await app.close();
    });

    it('rejects item edits once CONFIRMED', async () => {
      const tx = {
        supplierReturn: { findFirst: vi.fn().mockResolvedValue({ id: 'ret-1', status: 'CONFIRMED', items: [{ id: 'ri-1' }] }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/supplier-returns/ret-1/items/ri-1',
        payload: { qty: 5 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('refuses to delete the last remaining item', async () => {
      const tx = {
        supplierReturn: { findFirst: vi.fn().mockResolvedValue({ id: 'ret-1', status: 'DRAFT', items: [{ id: 'ri-1' }] }) },
        supplierReturnItem: { delete: vi.fn() },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/supplier-returns/ret-1/items/ri-1' });

      expect(response.statusCode).toBe(400);
      expect(tx.supplierReturnItem.delete).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
