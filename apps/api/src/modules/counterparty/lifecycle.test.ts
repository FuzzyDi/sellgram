import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cross-cutting scenarios for the B2B module (docs/B2B_COUNTERPARTIES.md
 * §13 step 8). routes.test.ts and order.service.test.ts already cover every
 * endpoint/function in isolation — this file exists for sequences that
 * span multiple endpoints, which unit tests of one handler at a time can't
 * exercise: create → price → order → payments, overpayment continuity,
 * due-date extension after a partial repayment, and the §11 "does not
 * touch Customer/Supplier" guarantee.
 *
 * Deliberately does NOT mock ./order.service.js — the real createB2BOrder()
 * transaction runs against the mocked prisma below, the same way
 * order.service.test.ts exercises it directly, just reached here through
 * the actual HTTP routes in sequence.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    counterparty: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    supplier: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    store: { findFirst: vi.fn() },
    product: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    productVariant: { findFirst: vi.fn(), update: vi.fn() },
    counterpartyPrice: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    counterpartyLedger: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    order: { findFirst: vi.fn(), create: vi.fn() },
    orderStatusLog: { create: vi.fn().mockResolvedValue({}) },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn(),
  },
  permissionGuard: vi.fn((_key: string) => async (_req: any, _reply: any) => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import counterpartyRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1' };
  });
  await app.register(counterpartyRoutes);
  return app;
}

describe('B2B cross-cutting scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissionGuard.mockImplementation((_key: string) => async (_req: any, _reply: any) => {});
    // Every $transaction call in both routes.ts and order.service.ts gets
    // the SAME mocks.prisma object as `tx` — this is what lets
    // Counterparty.currentDebt actually thread across sequential calls
    // below (a single shared counterparty.update mock, not a fresh one
    // per transaction), without building a full fake ORM.
    mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(mocks.prisma));
    mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    mocks.prisma.order.findFirst.mockResolvedValue(null);
    mocks.prisma.order.create.mockResolvedValue({ id: 'order-1', orderNumber: 1, items: [] });
    mocks.prisma.product.update.mockResolvedValue({ stockQty: 95 });
    mocks.prisma.productVariant.update.mockResolvedValue({ stockQty: 5 });
  });

  it('full lifecycle: Counterparty -> CounterpartyPrice -> B2B order using that price -> two partial payments -> currentDebt reaches exactly 0', async () => {
    const app = await buildApp();

    // 1. Create the counterparty.
    mocks.prisma.counterparty.create.mockResolvedValue({
      id: 'cp-1', tenantId: 'tenant-1', type: 'INDIVIDUAL', name: 'Acme', currentDebt: '0',
    });
    const createRes = await app.inject({
      method: 'POST',
      url: '/counterparties',
      payload: { type: 'INDIVIDUAL', name: 'Acme' },
    });
    expect(createRes.statusCode).toBe(201);

    // From here on, every existence check for this counterparty resolves —
    // isActive: true matters for order.service.ts's own check.
    mocks.prisma.counterparty.findFirst.mockResolvedValue({
      id: 'cp-1', tenantId: 'tenant-1', isActive: true,
    });

    // currentDebt itself is tracked here across every subsequent call,
    // via the one shared counterparty.update mock (see beforeEach comment).
    let currentDebt = 0;
    mocks.prisma.counterparty.update.mockImplementation(async ({ data }: any) => {
      if (data.currentDebt?.increment !== undefined) currentDebt += data.currentDebt.increment;
      if (data.currentDebt?.decrement !== undefined) currentDebt -= data.currentDebt.decrement;
      return { currentDebt };
    });

    // 2. Set a negotiated price for a product.
    mocks.prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
    mocks.prisma.counterpartyPrice.findFirst.mockResolvedValue(null); // no existing price row yet
    mocks.prisma.counterpartyPrice.create.mockResolvedValue({
      id: 'price-1', counterpartyId: 'cp-1', productId: 'prod-1', variantId: null, price: 8000,
    });
    const priceRes = await app.inject({
      method: 'PUT',
      url: '/counterparties/cp-1/prices',
      payload: { productId: 'prod-1', price: 8000 },
    });
    expect(priceRes.statusCode).toBe(200);
    const negotiatedPrice = priceRes.json().data.price;

    // 3. Create a B2B order for 5 units — must resolve to the negotiated
    // price above (§4), not Product.price, proving the two endpoints are
    // actually wired together, not just independently correct.
    mocks.prisma.product.findMany.mockResolvedValue([
      { id: 'prod-1', name: 'Widget', price: 999999, stockQty: 100, variants: [] }, // Product.price is a decoy
    ]);
    mocks.prisma.counterpartyPrice.findMany.mockResolvedValue([
      { counterpartyId: 'cp-1', productId: 'prod-1', variantId: null, price: negotiatedPrice },
    ]);
    // Reflect the actual resolved order items back, instead of the static
    // items: [] default — order.service.ts's return value is exactly what
    // this mock resolves to (it doesn't go through a real DB), so the
    // response needs to actually carry through what was computed.
    mocks.prisma.order.create.mockImplementation(async ({ data }: any) => ({
      id: 'order-1',
      orderNumber: 1,
      total: data.total,
      items: data.items.create,
    }));
    const orderRes = await app.inject({
      method: 'POST',
      url: '/counterparties/cp-1/orders',
      payload: { storeId: 'store-1', items: [{ productId: 'prod-1', qty: 5 }] },
    });
    expect(orderRes.statusCode).toBe(201);
    expect(orderRes.json().data.items[0].price).toBe(8000); // negotiated, not 999999
    expect(orderRes.json().data.total).toBe(40000); // 5 * 8000
    expect(currentDebt).toBe(40000);

    // 4. First partial payment.
    mocks.prisma.counterpartyLedger.create.mockResolvedValue({ id: 'ledger-payment-1', type: 'PAYMENT_RECEIVED' });
    const payment1 = await app.inject({
      method: 'POST',
      url: '/counterparties/cp-1/payments',
      payload: { amount: 15000 },
    });
    expect(payment1.statusCode).toBe(201);
    expect(currentDebt).toBe(25000);

    // 5. Second payment, exactly clearing the remainder.
    const payment2 = await app.inject({
      method: 'POST',
      url: '/counterparties/cp-1/payments',
      payload: { amount: 25000 },
    });
    expect(payment2.statusCode).toBe(201);
    expect(currentDebt).toBe(0);
    expect(payment2.json().data.currentDebt).toBe(0);

    await app.close();
  });

  it('overpayment continuity: currentDebt goes negative and a subsequent order correctly increases it back up', async () => {
    const app = await buildApp();
    mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1', tenantId: 'tenant-1', isActive: true });

    // Start already overpaid (simulates a prior payment that exceeded the
    // debt at the time) — nothing in createB2BOrder reads or branches on
    // currentDebt's sign, only writes an increment, so this should behave
    // identically regardless of the starting value.
    let currentDebt = -5000;
    mocks.prisma.counterparty.update.mockImplementation(async ({ data }: any) => {
      if (data.currentDebt?.increment !== undefined) currentDebt += data.currentDebt.increment;
      if (data.currentDebt?.decrement !== undefined) currentDebt -= data.currentDebt.decrement;
      return { currentDebt };
    });

    mocks.prisma.product.findMany.mockResolvedValue([
      { id: 'prod-1', name: 'Widget', price: 4000, stockQty: 100, variants: [] },
    ]);
    mocks.prisma.counterpartyPrice.findMany.mockResolvedValue([]);

    const orderRes = await app.inject({
      method: 'POST',
      url: '/counterparties/cp-1/orders',
      payload: { storeId: 'store-1', items: [{ productId: 'prod-1', qty: 5 }] }, // 5*4000=20000
    });

    expect(orderRes.statusCode).toBe(201);
    expect(currentDebt).toBe(15000); // -5000 + 20000
    await app.close();
  });

  it('due-date extension after a partial repayment targets only the ORDER_CHARGE row, never a PAYMENT_RECEIVED row', async () => {
    const app = await buildApp();
    mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1', tenantId: 'tenant-1', isActive: true });
    mocks.prisma.counterparty.update.mockResolvedValue({ currentDebt: 25000 });

    // A payment is recorded first (creating a PAYMENT_RECEIVED row)...
    const paymentRes = await app.inject({
      method: 'POST',
      url: '/counterparties/cp-1/payments',
      payload: { amount: 15000, note: 'Partial payment' },
    });
    expect(paymentRes.statusCode).toBe(201);
    const paymentLedgerCall = mocks.prisma.counterpartyLedger.create.mock.calls[0][0];
    expect(paymentLedgerCall.data.type).toBe('PAYMENT_RECEIVED');
    // PAYMENT_RECEIVED rows never carry a due date at all — confirms the
    // extension endpoint below can't accidentally have anything to grab
    // onto here.
    expect(paymentLedgerCall.data.dueDate).toBeUndefined();
    expect(paymentLedgerCall.data.originalDueDate).toBeUndefined();

    // ...then the ORIGINAL ORDER_CHARGE entry (a different id) has its due
    // date extended. The lookup is scoped by ledgerEntryId, so this must
    // resolve and update that row specifically, regardless of the payment
    // that happened in between.
    mocks.prisma.counterpartyLedger.findFirst.mockResolvedValue({
      id: 'ledger-charge-1',
      counterpartyId: 'cp-1',
      tenantId: 'tenant-1',
      type: 'ORDER_CHARGE',
      orderId: 'order-1',
      originalDueDate: new Date('2026-08-01T00:00:00.000Z'),
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
    });
    mocks.prisma.counterpartyLedger.update.mockResolvedValue({
      id: 'ledger-charge-1', dueDate: new Date('2026-09-01T00:00:00.000Z'),
    });

    const extendRes = await app.inject({
      method: 'PATCH',
      url: '/counterparties/cp-1/ledger/ledger-charge-1/due-date',
      payload: { newDueDate: '2026-09-01T00:00:00.000Z' },
    });

    expect(extendRes.statusCode).toBe(200);
    expect(mocks.prisma.counterpartyLedger.update).toHaveBeenCalledWith({
      where: { id: 'ledger-charge-1' }, // never 'ledger-payment-1' or any PAYMENT_RECEIVED id
      data: { dueDate: new Date('2026-09-01T00:00:00.000Z') },
    });
    await app.close();
  });

  it('§11 sanity check: Customer and Supplier are never read or written across the create -> price -> order -> payment sequence', async () => {
    const app = await buildApp();
    mocks.prisma.counterparty.create.mockResolvedValue({ id: 'cp-1', tenantId: 'tenant-1', currentDebt: '0' });
    mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1', tenantId: 'tenant-1', isActive: true });
    mocks.prisma.counterparty.update.mockResolvedValue({ currentDebt: 10000 });
    mocks.prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
    mocks.prisma.counterpartyPrice.findFirst.mockResolvedValue(null);
    mocks.prisma.counterpartyPrice.create.mockResolvedValue({ id: 'price-1', price: 5000 });
    mocks.prisma.product.findMany.mockResolvedValue([
      { id: 'prod-1', name: 'Widget', price: 5000, stockQty: 100, variants: [] },
    ]);
    mocks.prisma.counterpartyPrice.findMany.mockResolvedValue([]);
    mocks.prisma.counterpartyLedger.create.mockResolvedValue({ id: 'ledger-1' });

    await app.inject({ method: 'POST', url: '/counterparties', payload: { type: 'INDIVIDUAL', name: 'Acme' } });
    await app.inject({ method: 'PUT', url: '/counterparties/cp-1/prices', payload: { productId: 'prod-1', price: 5000 } });
    await app.inject({
      method: 'POST',
      url: '/counterparties/cp-1/orders',
      payload: { storeId: 'store-1', items: [{ productId: 'prod-1', qty: 2 }] },
    });
    await app.inject({ method: 'POST', url: '/counterparties/cp-1/payments', payload: { amount: 5000 } });

    expect(mocks.prisma.customer.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.customer.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.customer.update).not.toHaveBeenCalled();
    expect(mocks.prisma.customer.create).not.toHaveBeenCalled();
    // supplierId was never provided, so Supplier must never be consulted.
    expect(mocks.prisma.supplier.findFirst).not.toHaveBeenCalled();

    await app.close();
  });
});
