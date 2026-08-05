import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    purchaseOrder: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    purchaseOrderItem: { update: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    stockLedgerEntry: { create: vi.fn() },
    stockMovement: { create: vi.fn() },
    supplier: { update: vi.fn() },
    supplierLedger: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  planGuard: vi.fn((_key: string) => async () => {}),
  permissionGuard: vi.fn((_key: string) => async () => {}),
  getEffectivePermissions: vi.fn(() => ({ editReceivedDocuments: false })),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../auth/service.js', () => ({ getEffectivePermissions: mocks.getEffectivePermissions }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import procurementRoutes from './routes.js';

async function buildApp(role: string = 'OPERATOR') {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1', role };
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

    it('rejects a CREDIT purchase with no linked supplier', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders',
        payload: {
          supplierName: 'Supplier A',
          paymentMethod: 'CREDIT',
          items: [{ productId: 'p-1', qty: 10, unitCost: 5000 }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/supplier/i);
      await app.close();
    });

    it('accepts a CREDIT purchase with a linked supplier', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        purchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(null),
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
          supplierId: 'sup-1',
          paymentMethod: 'CREDIT',
          items: [{ productId: 'p-1', qty: 10, unitCost: 5000 }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ paymentMethod: 'CREDIT', supplierId: 'sup-1' }) })
      );
      await app.close();
    });

    it('rejects a CONSIGNMENT purchase with no linked supplier', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders',
        payload: {
          supplierName: 'Supplier A',
          paymentMethod: 'CONSIGNMENT',
          items: [{ productId: 'p-1', qty: 10, unitCost: 5000 }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/supplier/i);
      await app.close();
    });

    it('accepts a CONSIGNMENT purchase with a linked supplier', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        purchaseOrder: {
          findFirst: vi.fn().mockResolvedValue(null),
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
          supplierId: 'sup-1',
          paymentMethod: 'CONSIGNMENT',
          items: [{ productId: 'p-1', qty: 10, unitCost: 5000 }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ paymentMethod: 'CONSIGNMENT', supplierId: 'sup-1' }) })
      );
      await app.close();
    });
  });

  // ─── PATCH PO: status validation ─────────────────────────────────────────

  function makePatchTx(po: any) {
    const tx = {
      purchaseOrder: {
        findFirst: vi.fn().mockResolvedValue(po),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ role: 'OPERATOR', permissions: {} }),
      },
    };
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
    return tx;
  }

  describe('PATCH /purchase-orders/:id', () => {
    it('rejects invalid status string (Zod)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { status: 'FLYING' },
      });

      expect(response.statusCode).toBe(400);
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
      makePatchTx({ id: 'po-1', status: 'DRAFT' });

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
      const tx = makePatchTx({ id: 'po-1', status: 'DRAFT' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { status: 'ORDERED' },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ORDERED' }) })
      );
      await app.close();
    });

    it('allows ORDERED → CANCELLED', async () => {
      makePatchTx({ id: 'po-1', status: 'ORDERED' });

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
      makePatchTx({ id: 'po-1', status: 'RECEIVED' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { status: 'ORDERED' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 404 when PO not found for tenant', async () => {
      makePatchTx(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-999',
        payload: { note: 'update' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('rejects negative shippingCost (Zod)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { shippingCost: -100 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects changing paymentMethod once the PO is RECEIVED', async () => {
      makePatchTx({ id: 'po-1', status: 'RECEIVED' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { paymentMethod: 'CREDIT' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/payment method/i);
      await app.close();
    });

    it('rejects switching to CREDIT when no supplier is linked', async () => {
      makePatchTx({ id: 'po-1', status: 'DRAFT', supplierId: null });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { paymentMethod: 'CREDIT' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/supplier/i);
      await app.close();
    });

    it('allows switching to CREDIT when a supplier is already linked', async () => {
      const tx = makePatchTx({ id: 'po-1', status: 'DRAFT', supplierId: 'sup-1' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { paymentMethod: 'CREDIT' },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ paymentMethod: 'CREDIT' }) })
      );
      await app.close();
    });

    it('links relatesToId to another PO of the same tenant', async () => {
      const tx = makePatchTx({ id: 'po-1', status: 'DRAFT' });
      tx.purchaseOrder.findFirst
        .mockResolvedValueOnce({ id: 'po-1', status: 'DRAFT' }) // the PO being patched
        .mockResolvedValueOnce({ id: 'po-original' }); // the related-doc lookup

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { relatesToId: 'po-original' },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ relatesToId: 'po-original' }) })
      );
      await app.close();
    });

    it('rejects relatesToId pointing at a PO from another tenant', async () => {
      const tx = makePatchTx({ id: 'po-1', status: 'DRAFT' });
      tx.purchaseOrder.findFirst
        .mockResolvedValueOnce({ id: 'po-1', status: 'DRAFT' })
        .mockResolvedValueOnce(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { relatesToId: 'po-foreign' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/related document/i);
      await app.close();
    });

    it.each(['fxRate', 'shippingCost', 'customsCost'])('rejects changing %s once the PO is RECEIVED', async (field) => {
      makePatchTx({ id: 'po-1', status: 'RECEIVED' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { [field]: field === 'fxRate' ? 12000 : 500 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/received/i);
      await app.close();
    });

    it('rejects a note edit on a RECEIVED PO from an OPERATOR without editReceivedDocuments', async () => {
      makePatchTx({ id: 'po-1', status: 'RECEIVED' });
      mocks.getEffectivePermissions.mockReturnValueOnce({ editReceivedDocuments: false });

      const app = await buildApp('OPERATOR');
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { note: 'corrected note' },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('allows a note edit on a RECEIVED PO from an OPERATOR with editReceivedDocuments', async () => {
      const tx = makePatchTx({ id: 'po-1', status: 'RECEIVED' });
      mocks.getEffectivePermissions.mockReturnValueOnce({ editReceivedDocuments: true });

      const app = await buildApp('OPERATOR');
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { note: 'corrected note' },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ note: 'corrected note' }) })
      );
      await app.close();
    });

    it('allows a note edit on a RECEIVED PO from an OWNER without checking permissions', async () => {
      const tx = makePatchTx({ id: 'po-1', status: 'RECEIVED' });

      const app = await buildApp('OWNER');
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1',
        payload: { note: 'corrected note' },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.user.findUnique).not.toHaveBeenCalled();
      await app.close();
    });
  });

  // ─── Line-item CRUD: only while not RECEIVED/CANCELLED ───────────────────

  describe('POST /purchase-orders/:id/items', () => {
    function makeItemTx(po: any, overrides: any = {}) {
      const tx = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(po), update: vi.fn().mockResolvedValue({}) },
        product: { findFirst: vi.fn().mockResolvedValue({ id: 'p-2' }) },
        purchaseOrderItem: {
          create: vi.fn().mockResolvedValue({ id: 'poi-new', productId: 'p-2', qty: 3, unitCost: 100, totalCost: 300 }),
          findMany: vi.fn().mockResolvedValue([{ totalCost: 50000 }, { totalCost: 300 }]),
        },
        ...overrides,
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('adds an item and recomputes totalCost while the PO is DRAFT', async () => {
      const tx = makeItemTx({ id: 'po-1', status: 'DRAFT', items: [] });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/items',
        payload: { productId: 'p-2', qty: 3, unitCost: 100 },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.totalCost).toBe(50300);
      expect(tx.purchaseOrder.update).toHaveBeenCalledWith({ where: { id: 'po-1' }, data: { totalCost: 50300 } });
      await app.close();
    });

    it('rejects adding an item to a RECEIVED PO', async () => {
      makeItemTx({ id: 'po-1', status: 'RECEIVED', items: [] });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/items',
        payload: { productId: 'p-2', qty: 3, unitCost: 100 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects a product that does not belong to the tenant', async () => {
      makeItemTx({ id: 'po-1', status: 'DRAFT', items: [] }, { product: { findFirst: vi.fn().mockResolvedValue(null) } });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/items',
        payload: { productId: 'p-foreign', qty: 3, unitCost: 100 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('PATCH /purchase-orders/:id/items/:itemId', () => {
    it('updates qty/unitCost and recomputes totalCost', async () => {
      const existing = { id: 'poi-1', productId: 'p-1', qty: 5, unitCost: 1000 };
      const tx = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue({ id: 'po-1', status: 'DRAFT', items: [existing] }), update: vi.fn().mockResolvedValue({}) },
        purchaseOrderItem: {
          update: vi.fn().mockResolvedValue({ id: 'poi-1', qty: 8, unitCost: 1000, totalCost: 8000 }),
          findMany: vi.fn().mockResolvedValue([{ totalCost: 8000 }]),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1/items/poi-1',
        payload: { qty: 8 },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.purchaseOrderItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'poi-1' }, data: { qty: 8, unitCost: 1000, totalCost: 8000 } })
      );
      await app.close();
    });

    it('rejects editing an item on an already-RECEIVED PO', async () => {
      const existing = { id: 'poi-1', productId: 'p-1', qty: 5, unitCost: 1000 };
      const tx = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue({ id: 'po-1', status: 'RECEIVED', items: [existing] }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1/items/poi-1',
        payload: { qty: 8 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 404 for an item that does not belong to the PO', async () => {
      const tx = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue({ id: 'po-1', status: 'DRAFT', items: [] }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/purchase-orders/po-1/items/poi-missing',
        payload: { qty: 8 },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });

  describe('DELETE /purchase-orders/:id/items/:itemId', () => {
    it('removes an item and recomputes totalCost', async () => {
      const items = [{ id: 'poi-1', totalCost: 1000 }, { id: 'poi-2', totalCost: 2000 }];
      const tx = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue({ id: 'po-1', status: 'DRAFT', items }), update: vi.fn().mockResolvedValue({}) },
        purchaseOrderItem: {
          delete: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([{ totalCost: 2000 }]),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/purchase-orders/po-1/items/poi-1' });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.totalCost).toBe(2000);
      await app.close();
    });

    it('refuses to delete the last remaining item', async () => {
      const items = [{ id: 'poi-1', totalCost: 1000 }];
      const tx = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue({ id: 'po-1', status: 'DRAFT', items }) },
        purchaseOrderItem: { delete: vi.fn() },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/purchase-orders/po-1/items/poi-1' });

      expect(response.statusCode).toBe(400);
      expect(tx.purchaseOrderItem.delete).not.toHaveBeenCalled();
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

    function makeReceiveTx(overrides: any = {}) {
      const tx = {
        purchaseOrderItem: { update: vi.fn().mockResolvedValue({}) },
        product: {
          findFirst: vi.fn().mockResolvedValue({ stockQty: 5 }),
          update: vi.fn().mockResolvedValue({ stockQty: 15 }),
        },
        stockLedgerEntry: { create: vi.fn().mockResolvedValue({}) },
        stockMovement: { create: vi.fn().mockResolvedValue({}) },
        purchaseOrder: { update: vi.fn().mockResolvedValue({}) },
        supplier: { update: vi.fn().mockResolvedValue({}) },
        supplierLedger: { create: vi.fn().mockResolvedValue({}) },
        ...overrides,
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('wraps all updates in a single transaction and records the stock ledger', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(basePO);
      const tx = makeReceiveTx();

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/receive',
        payload: { items: [{ itemId: 'poi-1', qtyReceived: 10 }] },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.purchaseOrderItem.update).toHaveBeenCalledTimes(1);
      expect(tx.product.update).toHaveBeenCalledTimes(2); // stock + costPrice
      expect(tx.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'p-1', delta: 10, reason: 'RESTOCK', sourceType: 'PURCHASE_ORDER', sourceId: 'po-1',
        }),
      });
      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-1', delta: 10, qtyBefore: 5, qtyAfter: 15 }),
      });
      expect(tx.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RECEIVED' }) })
      );
      // No debt — basePO defaults to CASH
      expect(tx.supplierLedger.create).not.toHaveBeenCalled();
      // The outer prisma was NOT used directly
      expect(mocks.prisma.purchaseOrderItem.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('does not write a stock ledger row for a zero-qty receive line', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(basePO);
      const tx = makeReceiveTx();

      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/receive',
        payload: { items: [{ itemId: 'poi-1', qtyReceived: 0 }] },
      });

      expect(tx.stockLedgerEntry.create).not.toHaveBeenCalled();
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('charges the supplier ledger for a CREDIT PO based on qty actually received', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({
        ...basePO, paymentMethod: 'CREDIT', supplierId: 'sup-1',
        items: [{ id: 'poi-1', productId: 'p-1', totalCost: 50000, qty: 10, unitCost: 5000 }],
      });
      const tx = makeReceiveTx();

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/receive',
        // Only 6 of 10 ordered actually arrived — debt should be 6 * 5000, not 10 * 5000
        payload: { items: [{ itemId: 'poi-1', qtyReceived: 6 }] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.debtCharged).toBe(30000);
      expect(tx.supplier.update).toHaveBeenCalledWith({
        where: { id: 'sup-1' },
        data: { currentDebt: { increment: 30000 } },
      });
      expect(tx.supplierLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          supplierId: 'sup-1', type: 'PURCHASE_CHARGE', delta: 30000, purchaseOrderId: 'po-1',
        }),
      });
      await app.close();
    });

    it('does not charge the supplier ledger for CASH/NON_CASH POs', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({
        ...basePO, paymentMethod: 'NON_CASH', supplierId: 'sup-1',
      });
      const tx = makeReceiveTx();

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/receive',
        payload: { items: [{ itemId: 'poi-1', qtyReceived: 10 }] },
      });

      expect(response.json().data.debtCharged).toBe(0);
      expect(tx.supplier.update).not.toHaveBeenCalled();
      expect(tx.supplierLedger.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when product does not belong to tenant (rolled back)', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(basePO);
      const tx = makeReceiveTx({
        product: { findFirst: vi.fn().mockResolvedValue(null) }, // tenant mismatch
      });

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
        payload: { items: [{ itemId: 'poi-1', qtyReceived: 5 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('RECEIVED');
      await app.close();
    });

    it('rejects missing items with 400 (Zod)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/receive',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects negative qtyReceived with 400 (Zod)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-orders/po-1/receive',
        payload: { items: [{ itemId: 'poi-1', qtyReceived: -3 }] },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });
});
