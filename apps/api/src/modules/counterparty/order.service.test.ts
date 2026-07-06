import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    counterparty: { findFirst: vi.fn() },
    store: { findFirst: vi.fn() },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    counterpartyPrice: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import { createB2BOrder, CounterpartyOrderError } from './order.service.js';

function makeTx(overrides: any = {}) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ stockQty: 0 }),
    },
    productVariant: {
      update: vi.fn().mockResolvedValue({ stockQty: 0 }),
    },
    order: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 1, items: [] }),
    },
    orderStatusLog: { create: vi.fn().mockResolvedValue({}) },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    counterparty: { update: vi.fn().mockResolvedValue({}) },
    counterpartyLedger: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

const baseInput = {
  tenantId: 't-1',
  storeId: 'store-1',
  counterpartyId: 'cp-1',
  actorUserId: 'user-1',
};

describe('createB2BOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1', tenantId: 't-1', isActive: true });
    mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    mocks.prisma.counterpartyPrice.findMany.mockResolvedValue([]);
  });

  describe('validation errors (thrown before the transaction)', () => {
    it('throws EMPTY_ORDER for an empty items array', async () => {
      await expect(createB2BOrder({ ...baseInput, items: [], deliveryType: 'PICKUP' })).rejects.toThrow('EMPTY_ORDER');
      expect(mocks.prisma.counterparty.findFirst).not.toHaveBeenCalled();
    });

    it('throws COUNTERPARTY_NOT_FOUND for a foreign/missing counterparty', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue(null);
      await expect(
        createB2BOrder({ ...baseInput, items: [{ productId: 'p-1', qty: 1 }], deliveryType: 'PICKUP' })
      ).rejects.toThrow('COUNTERPARTY_NOT_FOUND');
    });

    it('throws COUNTERPARTY_INACTIVE for a deactivated counterparty', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1', tenantId: 't-1', isActive: false });
      await expect(
        createB2BOrder({ ...baseInput, items: [{ productId: 'p-1', qty: 1 }], deliveryType: 'PICKUP' })
      ).rejects.toThrow('COUNTERPARTY_INACTIVE');
    });

    it('throws STORE_NOT_FOUND for a foreign/missing store', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);
      await expect(
        createB2BOrder({ ...baseInput, items: [{ productId: 'p-1', qty: 1 }], deliveryType: 'PICKUP' })
      ).rejects.toThrow('STORE_NOT_FOUND');
    });

    it('throws PRODUCT_NOT_FOUND for a product outside the tenant', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([]);
      await expect(
        createB2BOrder({ ...baseInput, items: [{ productId: 'p-foreign', qty: 1 }], deliveryType: 'PICKUP' })
      ).rejects.toThrow('PRODUCT_NOT_FOUND:p-foreign');
    });

    it('throws VARIANT_NOT_FOUND when variantId does not belong to the product', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', name: 'Widget', price: 1000, stockQty: 10, variants: [] },
      ]);
      await expect(
        createB2BOrder({ ...baseInput, items: [{ productId: 'p-1', variantId: 'v-foreign', qty: 1 }], deliveryType: 'PICKUP' })
      ).rejects.toThrow('VARIANT_NOT_FOUND:v-foreign');
    });

    it('throws INVALID_QUANTITY for a non-positive quantity', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', name: 'Widget', price: 1000, stockQty: 10, variants: [] },
      ]);
      await expect(
        createB2BOrder({ ...baseInput, items: [{ productId: 'p-1', qty: 0 }], deliveryType: 'PICKUP' })
      ).rejects.toThrow('INVALID_QUANTITY:p-1');
    });
  });

  describe('price resolution (§4)', () => {
    it('resolves all three price sources: CounterpartyPrice > variant price > product price', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'prod-A', name: 'Product A', price: 1000, stockQty: 10, variants: [] },
        {
          id: 'prod-B',
          name: 'Product B',
          price: 2000,
          stockQty: 10,
          variants: [{ id: 'var-B1', name: 'Blue', isActive: true, price: 1500, stockQty: 5 }],
        },
        { id: 'prod-C', name: 'Product C', price: 3000, stockQty: 10, variants: [] },
      ]);
      mocks.prisma.counterpartyPrice.findMany.mockResolvedValue([
        { counterpartyId: 'cp-1', productId: 'prod-C', variantId: null, price: 5000 },
      ]);

      const tx = makeTx({
        product: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'prod-A', stockQty: 10, variants: [] },
            { id: 'prod-B', stockQty: 10, variants: [{ id: 'var-B1', isActive: true, stockQty: 5 }] },
            { id: 'prod-C', stockQty: 10, variants: [] },
          ]),
          update: vi.fn().mockResolvedValue({ stockQty: 7 }),
        },
        productVariant: { update: vi.fn().mockResolvedValue({ stockQty: 4 }) },
        order: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 1, items: [] }) },
      });
      mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await createB2BOrder({
        ...baseInput,
        deliveryType: 'PICKUP',
        items: [
          { productId: 'prod-A', qty: 2 }, // -> Product.price (1000)
          { productId: 'prod-B', variantId: 'var-B1', qty: 1 }, // -> variant.price (1500)
          { productId: 'prod-C', qty: 3 }, // -> CounterpartyPrice (5000)
        ],
      });

      const createCall = tx.order.create.mock.calls[0][0];
      const items = createCall.data.items.create;
      expect(items).toEqual([
        expect.objectContaining({ productId: 'prod-A', variantId: null, price: 1000, qty: 2, total: 2000 }),
        expect.objectContaining({ productId: 'prod-B', variantId: 'var-B1', price: 1500, qty: 1, total: 1500 }),
        expect.objectContaining({ productId: 'prod-C', variantId: null, price: 5000, qty: 3, total: 15000 }),
      ]);
      // subtotal = 2000 + 1500 + 15000 = 18500; no deliveryPrice supplied.
      expect(createCall.data.subtotal).toBe(18500);
      expect(createCall.data.total).toBe(18500);
      expect(createCall.data.salesChannel).toBe('B2B');
      expect(createCall.data.counterpartyId).toBe('cp-1');
      expect(createCall.data.customerId).toBeNull();
    });
  });

  describe('stock', () => {
    it('blocks order creation when stock is insufficient (re-checked inside the lock)', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Widget', price: 1000, stockQty: 10, variants: [] },
      ]);

      const tx = makeTx({
        // Fresh, re-checked stock inside the transaction is lower than the
        // pre-check saw — simulates a concurrent sale winning the race.
        product: { findMany: vi.fn().mockResolvedValue([{ id: 'prod-1', stockQty: 1, variants: [] }]), update: vi.fn() },
      });
      mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await expect(
        createB2BOrder({ ...baseInput, deliveryType: 'PICKUP', items: [{ productId: 'prod-1', qty: 5 }] })
      ).rejects.toThrow('INSUFFICIENT_STOCK:Widget');

      expect(tx.order.create).not.toHaveBeenCalled();
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('decrements Product.stockQty and ProductVariant.stockQty with matching StockMovement rows', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Widget',
          price: 1000,
          stockQty: 10,
          variants: [{ id: 'var-1', name: 'Red', isActive: true, price: null, stockQty: 5 }],
        },
      ]);

      const tx = makeTx({
        product: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'prod-1', stockQty: 10, variants: [{ id: 'var-1', isActive: true, stockQty: 5 }] },
          ]),
          update: vi.fn().mockResolvedValue({ stockQty: 8 }),
        },
        productVariant: { update: vi.fn().mockResolvedValue({ stockQty: 3 }) },
        order: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 9, items: [] }) },
      });
      mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await createB2BOrder({
        ...baseInput,
        deliveryType: 'PICKUP',
        items: [
          { productId: 'prod-1', qty: 2 }, // no variant
          { productId: 'prod-1', variantId: 'var-1', qty: 2 },
        ],
      });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stockQty: { decrement: 2 } },
        select: { stockQty: true },
      });
      expect(tx.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: { stockQty: { decrement: 2 } },
        select: { stockQty: true },
      });
      expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // No variantId key at all for the non-variant branch — matches
          // bot/checkout.service.ts's exact shape (relies on the column's
          // nullable default rather than an explicit `variantId: null`).
          data: expect.objectContaining({ productId: 'prod-1', delta: -2, qtyBefore: 10, qtyAfter: 8 }),
        })
      );
      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ productId: 'prod-1', variantId: 'var-1', delta: -2, qtyBefore: 5, qtyAfter: 3 }),
        })
      );
    });
  });

  describe('debt ledger', () => {
    it('updates Counterparty.currentDebt and writes a matching ORDER_CHARGE row in the same transaction', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Widget', price: 1000, stockQty: 10, variants: [] },
      ]);

      const tx = makeTx({
        product: {
          findMany: vi.fn().mockResolvedValue([{ id: 'prod-1', stockQty: 10, variants: [] }]),
          update: vi.fn().mockResolvedValue({ stockQty: 5 }),
        },
        order: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'order-42', orderNumber: 1, items: [] }) },
      });
      mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await createB2BOrder({
        ...baseInput,
        deliveryType: 'PICKUP',
        paymentTermDays: 14,
        items: [{ productId: 'prod-1', qty: 5 }], // 5 * 1000 = 5000
      });

      expect(tx.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cp-1' },
        data: { currentDebt: { increment: 5000 } },
      });

      const ledgerCall = tx.counterpartyLedger.create.mock.calls[0][0];
      expect(ledgerCall.data).toEqual(
        expect.objectContaining({
          tenantId: 't-1',
          counterpartyId: 'cp-1',
          type: 'ORDER_CHARGE',
          delta: 5000,
          orderId: 'order-42',
        })
      );
      // originalDueDate and dueDate both equal orderDate + 14 days, and are
      // equal to each other at creation time (§7 — dueDate only diverges
      // from originalDueDate later, via an explicit extension).
      expect(ledgerCall.data.originalDueDate).toEqual(ledgerCall.data.dueDate);
      const daysAhead = (ledgerCall.data.dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysAhead).toBeGreaterThan(13.9);
      expect(daysAhead).toBeLessThan(14.1);
    });

    it('defaults paymentTermDays to 30 when not provided', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Widget', price: 1000, stockQty: 10, variants: [] },
      ]);
      const tx = makeTx({
        product: {
          findMany: vi.fn().mockResolvedValue([{ id: 'prod-1', stockQty: 10, variants: [] }]),
          update: vi.fn().mockResolvedValue({ stockQty: 9 }),
        },
        order: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 1, items: [] }) },
      });
      mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await createB2BOrder({ ...baseInput, deliveryType: 'PICKUP', items: [{ productId: 'prod-1', qty: 1 }] });

      const ledgerCall = tx.counterpartyLedger.create.mock.calls[0][0];
      const daysAhead = (ledgerCall.data.dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysAhead).toBeGreaterThan(29.9);
      expect(daysAhead).toBeLessThan(30.1);
    });
  });

  describe('orderNumber generation', () => {
    it('serializes via the same per-tenant advisory lock as Telegram checkout', async () => {
      // This proves B2B orders take the SAME lock key (hashtext(tenantId))
      // and read the SAME tenant-wide `orderBy: orderNumber desc` query
      // that bot/checkout.service.ts uses — meaning concurrent B2B and
      // Telegram orders in the same tenant serialize against each other
      // and cannot collide on orderNumber. Actually proving no collision
      // under real concurrency needs a genuine Postgres integration test
      // (two real transactions racing for the same advisory lock) — a
      // mocked-prisma unit test can't exercise real lock contention, only
      // confirm the same mechanism is invoked.
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Widget', price: 1000, stockQty: 10, variants: [] },
      ]);
      const tx = makeTx({
        product: {
          findMany: vi.fn().mockResolvedValue([{ id: 'prod-1', stockQty: 10, variants: [] }]),
          update: vi.fn().mockResolvedValue({ stockQty: 9 }),
        },
        order: { findFirst: vi.fn().mockResolvedValue({ orderNumber: 41 }), create: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 42, items: [] }) },
      });
      mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await createB2BOrder({ ...baseInput, deliveryType: 'PICKUP', items: [{ productId: 'prod-1', qty: 1 }] });

      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.order.findFirst).toHaveBeenCalledWith({ where: { tenantId: 't-1' }, orderBy: { orderNumber: 'desc' } });
      expect(tx.order.create.mock.calls[0][0].data.orderNumber).toBe(42);
    });
  });
});
