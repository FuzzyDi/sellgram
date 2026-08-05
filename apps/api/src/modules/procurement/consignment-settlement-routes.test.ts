import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    purchaseOrder: { findFirst: vi.fn() },
    purchaseOrderItem: { findUnique: vi.fn() },
    consignmentSettlement: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    consignmentSettlementItem: { aggregate: vi.fn(), update: vi.fn() },
    supplier: { update: vi.fn() },
    supplierLedger: { create: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  permissionGuard: vi.fn((_key: string) => async () => {}),
  planGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));

import consignmentSettlementRoutes from './consignment-settlement-routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1', role: 'OWNER' };
  });
  await app.register(consignmentSettlementRoutes);
  return app;
}

// remainingForPoItem does one findUnique (qtyReceived) + one aggregate
// (sum of CONFIRMED qtySold) per call, against whichever client it's
// given (prisma outside a transaction, tx inside one) — both point at
// the same mocks here since the tests below stub the tx object's
// purchaseOrderItem/consignmentSettlementItem to the same vi.fn()s.
function mockRemaining(qtyReceived: number, alreadySettled: number) {
  mocks.prisma.purchaseOrderItem.findUnique.mockResolvedValue({ qtyReceived });
  mocks.prisma.consignmentSettlementItem.aggregate.mockResolvedValue({ _sum: { qtySold: alreadySettled } });
}

describe('consignment-settlement.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('GET /consignment-settlements', () => {
    it('attaches a computed "remaining" field to each item (list renders straight from this, no per-id fetch)', async () => {
      mocks.prisma.consignmentSettlement.findMany.mockResolvedValue([
        { id: 'cs-1', items: [{ id: 'csi-1', purchaseOrderItemId: 'poi-1' }] },
      ]);
      mockRemaining(10, 3); // remaining = 7

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/consignment-settlements' });

      expect(response.statusCode).toBe(200);
      expect(response.json().data[0].items[0].remaining).toBe(7);
      await app.close();
    });
  });

  describe('POST /consignment-settlements', () => {
    const consignmentPo = {
      id: 'po-1', paymentMethod: 'CONSIGNMENT', status: 'RECEIVED', supplierId: 'sup-1',
      items: [{ id: 'poi-1', unitCost: 1000, qtyReceived: 10 }],
    };

    it('auto-populates one item per PO line with qtySold 0', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(consignmentPo);
      mockRemaining(10, 0);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        consignmentSettlement: {
          findFirst: vi.fn().mockResolvedValue({ settlementNumber: 0 }),
          create: vi.fn().mockResolvedValue({ id: 'cs-1', settlementNumber: 1, items: [] }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/consignment-settlements', payload: { purchaseOrderId: 'po-1' } });

      expect(response.statusCode).toBe(200);
      expect(tx.consignmentSettlement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            settlementNumber: 1,
            purchaseOrderId: 'po-1',
            items: { create: [{ purchaseOrderItemId: 'poi-1', unitCost: 1000, qtySold: 0, debtCharged: 0 }] },
          }),
        })
      );
      await app.close();
    });

    it('rejects a PO that is not CONSIGNMENT', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ ...consignmentPo, paymentMethod: 'CREDIT' });
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/consignment-settlements', payload: { purchaseOrderId: 'po-1' } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/consignment/i);
      await app.close();
    });

    it('rejects a PO that has not been received yet', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ ...consignmentPo, status: 'IN_TRANSIT' });
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/consignment-settlements', payload: { purchaseOrderId: 'po-1' } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/received/i);
      await app.close();
    });

    it('rejects a PO that has already been fully settled', async () => {
      mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(consignmentPo);
      mockRemaining(10, 10); // fully settled — remaining 0
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/consignment-settlements', payload: { purchaseOrderId: 'po-1' } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/fully settled/i);
      await app.close();
    });
  });

  describe('PATCH /consignment-settlements/:id', () => {
    function makePatchTx(settlement: any) {
      const tx = { consignmentSettlement: { findFirst: vi.fn().mockResolvedValue(settlement), update: vi.fn().mockResolvedValue({}) } };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('rejects a direct CONFIRMED transition', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/consignment-settlements/cs-1', payload: { status: 'CONFIRMED' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('allows DRAFT -> CANCELLED', async () => {
      const tx = makePatchTx({ id: 'cs-1', status: 'DRAFT' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/consignment-settlements/cs-1', payload: { status: 'CANCELLED' } });
      expect(response.statusCode).toBe(200);
      expect(tx.consignmentSettlement.update).toHaveBeenCalledWith({ where: { id: 'cs-1' }, data: { status: 'CANCELLED' } });
      await app.close();
    });

    it('rejects editing an already-CONFIRMED settlement', async () => {
      makePatchTx({ id: 'cs-1', status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/consignment-settlements/cs-1', payload: { note: 'oops' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('PATCH /consignment-settlements/:id/items/:itemId', () => {
    it('sets qtySold and debtCharged when within remaining', async () => {
      mockRemaining(10, 2); // remaining = 8
      const tx = {
        consignmentSettlement: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'cs-1', status: 'DRAFT',
            items: [{ id: 'csi-1', purchaseOrderItemId: 'poi-1', unitCost: 1000 }],
          }),
        },
        purchaseOrderItem: mocks.prisma.purchaseOrderItem,
        consignmentSettlementItem: {
          ...mocks.prisma.consignmentSettlementItem,
          update: vi.fn().mockResolvedValue({ id: 'csi-1', qtySold: 5, debtCharged: 5000 }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/consignment-settlements/cs-1/items/csi-1', payload: { qtySold: 5 } });

      expect(response.statusCode).toBe(200);
      expect(tx.consignmentSettlementItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'csi-1' }, data: { qtySold: 5, debtCharged: 5000 } })
      );
      await app.close();
    });

    it('rejects a qtySold that exceeds what remains unsettled', async () => {
      mockRemaining(10, 8); // remaining = 2
      const tx = {
        consignmentSettlement: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'cs-1', status: 'DRAFT',
            items: [{ id: 'csi-1', purchaseOrderItemId: 'poi-1', unitCost: 1000 }],
          }),
        },
        purchaseOrderItem: mocks.prisma.purchaseOrderItem,
        consignmentSettlementItem: mocks.prisma.consignmentSettlementItem,
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/consignment-settlements/cs-1/items/csi-1', payload: { qtySold: 5 } });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/exceeds/i);
      await app.close();
    });

    it('rejects item edits once CONFIRMED', async () => {
      const tx = {
        consignmentSettlement: { findFirst: vi.fn().mockResolvedValue({ id: 'cs-1', status: 'CONFIRMED', items: [{ id: 'csi-1' }] }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/consignment-settlements/cs-1/items/csi-1', payload: { qtySold: 1 } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /consignment-settlements/:id/confirm', () => {
    const baseSettlement = {
      id: 'cs-1', status: 'DRAFT', settlementNumber: 1,
      purchaseOrder: { id: 'po-1', poNumber: 7, supplierId: 'sup-1', fxRate: 12000 },
      items: [
        { id: 'csi-1', purchaseOrderItemId: 'poi-1', qtySold: 3, unitCost: 10 }, // 3 * 10 = 30 (foreign) -> *12000 = 360000
        { id: 'csi-2', purchaseOrderItemId: 'poi-2', qtySold: 0, unitCost: 20 }, // skipped, nothing sold
      ],
    };

    function makeConfirmTx() {
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        purchaseOrderItem: mocks.prisma.purchaseOrderItem,
        consignmentSettlementItem: mocks.prisma.consignmentSettlementItem,
        supplier: { update: vi.fn().mockResolvedValue({}) },
        supplierLedger: { create: vi.fn().mockResolvedValue({}) },
        consignmentSettlement: { update: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('charges fx-converted debt for the sold item, skips the zero item, writes one ledger row', async () => {
      mocks.prisma.consignmentSettlement.findFirst.mockResolvedValue(baseSettlement);
      mockRemaining(10, 0); // remaining = 10, qtySold=3 is within bounds for whichever item is checked
      const tx = makeConfirmTx();

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/consignment-settlements/cs-1/confirm' });

      expect(response.statusCode).toBe(200);
      // Advisory lock scoped to this PO — guards against two concurrent
      // settlements for the same PO both passing the OVERSOLD check.
      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.supplier.update).toHaveBeenCalledTimes(1);
      expect(tx.supplier.update).toHaveBeenCalledWith({
        where: { id: 'sup-1' }, data: { currentDebt: { increment: 360000 } },
      });
      expect(tx.supplierLedger.create).toHaveBeenCalledTimes(1);
      expect(tx.supplierLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          supplierId: 'sup-1', type: 'PURCHASE_CHARGE', delta: 360000,
          purchaseOrderId: 'po-1', consignmentSettlementId: 'cs-1',
        }),
      });
      expect(tx.consignmentSettlement.update).toHaveBeenCalledWith({
        where: { id: 'cs-1' }, data: expect.objectContaining({ status: 'CONFIRMED', totalDebtCharged: 360000 }),
      });
      await app.close();
    });

    it('confirms without touching the supplier ledger when nothing was sold', async () => {
      const allZero = { ...baseSettlement, items: baseSettlement.items.map((i) => ({ ...i, qtySold: 0 })) };
      mocks.prisma.consignmentSettlement.findFirst.mockResolvedValue(allZero);
      const tx = makeConfirmTx();

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/consignment-settlements/cs-1/confirm' });

      expect(response.statusCode).toBe(200);
      expect(tx.supplier.update).not.toHaveBeenCalled();
      expect(tx.supplierLedger.create).not.toHaveBeenCalled();
      expect(tx.consignmentSettlement.update).toHaveBeenCalledWith({
        where: { id: 'cs-1' }, data: expect.objectContaining({ status: 'CONFIRMED', totalDebtCharged: 0 }),
      });
      await app.close();
    });

    it('rejects confirming an already-CONFIRMED settlement', async () => {
      mocks.prisma.consignmentSettlement.findFirst.mockResolvedValue({ ...baseSettlement, status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/consignment-settlements/cs-1/confirm' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('re-validates OVERSOLD at confirm time (e.g. a concurrent settlement already consumed the balance)', async () => {
      mocks.prisma.consignmentSettlement.findFirst.mockResolvedValue(baseSettlement);
      mockRemaining(10, 8); // remaining now only 2, but item.qtySold is 3 -> oversold
      const tx = makeConfirmTx();

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/consignment-settlements/cs-1/confirm' });

      expect(response.statusCode).toBe(400);
      expect(tx.consignmentSettlement.update).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
