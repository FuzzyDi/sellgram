import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    customerReturn: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    customerReturnItem: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    counterparty: { findFirst: vi.fn(), update: vi.fn() },
    order: { findFirst: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    stockLedgerEntry: { create: vi.fn() },
    stockMovement: { create: vi.fn() },
    counterpartyLedger: { create: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  permissionGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import customerReturnRoutes from './customer-return-routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1', role: 'OWNER' };
  });
  await app.register(customerReturnRoutes);
  return app;
}

describe('customer-return.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('POST /customer-returns', () => {
    it('creates a return with an advisory-locked sequential returnNumber (no counterparty)', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        customerReturn: {
          findFirst: vi.fn().mockResolvedValue({ returnNumber: 3 }),
          create: vi.fn().mockResolvedValue({ id: 'ret-1', returnNumber: 4, items: [] }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customer-returns',
        payload: { items: [{ productId: 'p-1', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.customerReturn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ returnNumber: 4, counterpartyId: null }) })
      );
      await app.close();
    });

    it('rejects a counterparty not belonging to the tenant', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customer-returns',
        payload: { counterpartyId: 'cp-foreign', items: [{ productId: 'p-1', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/counterparty/i);
      await app.close();
    });

    it('rejects an invalid linked order', async () => {
      mocks.prisma.order.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customer-returns',
        payload: { orderId: 'order-foreign', items: [{ productId: 'p-1', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/order/i);
      await app.close();
    });

    it('rejects a product not belonging to the tenant', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customer-returns',
        payload: { items: [{ productId: 'p-foreign', qty: 2, unitCost: 1000 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/invalid/i);
      await app.close();
    });
  });

  describe('PATCH /customer-returns/:id', () => {
    function makePatchTx(ret: any) {
      const tx = { customerReturn: { findFirst: vi.fn().mockResolvedValue(ret), update: vi.fn().mockResolvedValue({}) } };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('rejects a direct CONFIRMED transition', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/customer-returns/ret-1', payload: { status: 'CONFIRMED' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('allows DRAFT -> CANCELLED', async () => {
      const tx = makePatchTx({ id: 'ret-1', status: 'DRAFT' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/customer-returns/ret-1', payload: { status: 'CANCELLED' } });
      expect(response.statusCode).toBe(200);
      expect(tx.customerReturn.update).toHaveBeenCalledWith({ where: { id: 'ret-1' }, data: { status: 'CANCELLED' } });
      await app.close();
    });

    it('rejects editing an already-CONFIRMED return', async () => {
      makePatchTx({ id: 'ret-1', status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/customer-returns/ret-1', payload: { note: 'oops' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /customer-returns/:id/confirm', () => {
    function makeConfirmTx() {
      const tx = {
        product: { findFirst: vi.fn().mockResolvedValue({ stockQty: 10 }), update: vi.fn().mockResolvedValue({ stockQty: 12 }) },
        stockLedgerEntry: { create: vi.fn().mockResolvedValue({}) },
        stockMovement: { create: vi.fn().mockResolvedValue({}) },
        counterparty: { update: vi.fn().mockResolvedValue({}) },
        counterpartyLedger: { create: vi.fn().mockResolvedValue({}) },
        customerReturn: { update: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('increments stock and decreases counterparty debt when linked to a counterparty', async () => {
      const withCounterparty = {
        id: 'ret-1', status: 'DRAFT', returnNumber: 1, counterpartyId: 'cp-1', orderId: 'order-1', totalCost: 2000,
        items: [{ id: 'ri-1', productId: 'p-1', qty: 2, unitCost: 1000 }],
      };
      mocks.prisma.customerReturn.findFirst.mockResolvedValue(withCounterparty);
      const tx = makeConfirmTx();

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/customer-returns/ret-1/confirm' });

      expect(response.statusCode).toBe(200);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' }, data: { stockQty: { increment: 2 } }, select: { stockQty: true },
      });
      expect(tx.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-1', delta: 2, reason: 'CUSTOMER_RETURN', sourceType: 'CUSTOMER_RETURN', sourceId: 'ret-1' }),
      });
      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ delta: 2, qtyBefore: 10, qtyAfter: 12 }),
      });
      expect(tx.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cp-1' }, data: { currentDebt: { increment: -2000 } },
      });
      expect(tx.counterpartyLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ counterpartyId: 'cp-1', type: 'RETURN', delta: -2000, orderId: 'order-1', customerReturnId: 'ret-1' }),
      });
      expect(tx.customerReturn.update).toHaveBeenCalledWith({
        where: { id: 'ret-1' }, data: expect.objectContaining({ status: 'CONFIRMED' }),
      });
      await app.close();
    });

    it('increments stock only, no debt/ledger writes, when no counterparty is linked', async () => {
      const withoutCounterparty = {
        id: 'ret-2', status: 'DRAFT', returnNumber: 2, counterpartyId: null, orderId: null, totalCost: 2000,
        items: [{ id: 'ri-1', productId: 'p-1', qty: 2, unitCost: 1000 }],
      };
      mocks.prisma.customerReturn.findFirst.mockResolvedValue(withoutCounterparty);
      const tx = makeConfirmTx();

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/customer-returns/ret-2/confirm' });

      expect(response.statusCode).toBe(200);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' }, data: { stockQty: { increment: 2 } }, select: { stockQty: true },
      });
      expect(tx.counterparty.update).not.toHaveBeenCalled();
      expect(tx.counterpartyLedger.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects confirming an already-CONFIRMED return', async () => {
      mocks.prisma.customerReturn.findFirst.mockResolvedValue({
        id: 'ret-1', status: 'CONFIRMED', returnNumber: 1, counterpartyId: null, orderId: null, totalCost: 2000,
        items: [{ id: 'ri-1', productId: 'p-1', qty: 2, unitCost: 1000 }],
      });
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/customer-returns/ret-1/confirm' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 400 when a product does not belong to the tenant (rolled back)', async () => {
      mocks.prisma.customerReturn.findFirst.mockResolvedValue({
        id: 'ret-1', status: 'DRAFT', returnNumber: 1, counterpartyId: 'cp-1', orderId: null, totalCost: 2000,
        items: [{ id: 'ri-1', productId: 'p-1', qty: 2, unitCost: 1000 }],
      });
      const tx = makeConfirmTx();
      tx.product.findFirst = vi.fn().mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/customer-returns/ret-1/confirm' });

      expect(response.statusCode).toBe(400);
      expect(tx.customerReturn.update).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('line-item CRUD', () => {
    it('adds an item while DRAFT and recomputes totalCost', async () => {
      const tx = {
        customerReturn: { findFirst: vi.fn().mockResolvedValue({ id: 'ret-1', status: 'DRAFT', items: [] }), update: vi.fn().mockResolvedValue({}) },
        product: { findFirst: vi.fn().mockResolvedValue({ id: 'p-2' }) },
        customerReturnItem: {
          create: vi.fn().mockResolvedValue({ id: 'ri-new' }),
          findMany: vi.fn().mockResolvedValue([{ totalCost: 500 }]),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customer-returns/ret-1/items',
        payload: { productId: 'p-2', qty: 1, unitCost: 500 },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.totalCost).toBe(500);
      await app.close();
    });

    it('rejects item edits once CONFIRMED', async () => {
      const tx = {
        customerReturn: { findFirst: vi.fn().mockResolvedValue({ id: 'ret-1', status: 'CONFIRMED', items: [{ id: 'ri-1' }] }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/customer-returns/ret-1/items/ri-1',
        payload: { qty: 5 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('refuses to delete the last remaining item', async () => {
      const tx = {
        customerReturn: { findFirst: vi.fn().mockResolvedValue({ id: 'ret-1', status: 'DRAFT', items: [{ id: 'ri-1' }] }) },
        customerReturnItem: { delete: vi.fn() },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/customer-returns/ret-1/items/ri-1' });

      expect(response.statusCode).toBe(400);
      expect(tx.customerReturnItem.delete).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
