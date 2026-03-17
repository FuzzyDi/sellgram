import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareOrderPayment: vi.fn(),
  prisma: {
    cartItem: { findMany: vi.fn(), deleteMany: vi.fn() },
    product: { findFirst: vi.fn(), findMany: vi.fn() },
    deliveryZone: { findFirst: vi.fn() },
    storePaymentMethod: { findFirst: vi.fn() },
    loyaltyConfig: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(), update: vi.fn() },
    order: { findFirst: vi.fn(), create: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    loyaltyTransaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// tx always has $executeRaw for advisory lock
function makeTx(overrides: Record<string, any> = {}) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    product: { findMany: vi.fn().mockResolvedValue([]) },
    order: { findFirst: vi.fn(), create: vi.fn() },
    customer: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    loyaltyConfig: { findUnique: vi.fn() },
    orderStatusLog: { create: vi.fn().mockResolvedValue({}) },
    loyaltyTransaction: { create: vi.fn().mockResolvedValue({}) },
    promoCode: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
    cartItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...overrides,
  };
}

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../payments/service.js', () => ({ prepareOrderPayment: mocks.prepareOrderPayment }));

import { createShopCheckoutOrder } from './checkout.service.js';

describe('checkout.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when cart is empty', async () => {
    mocks.prisma.cartItem.findMany.mockResolvedValue([]);

    await expect(
      createShopCheckoutOrder({
        customerId: 'c-1',
        tenantId: 't-1',
        storeId: 's-1',
        body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 0 },
      })
    ).rejects.toThrow('Cart is empty');
  });

  it('throws when payment method is unavailable', async () => {
    mocks.prisma.cartItem.findMany.mockResolvedValue([{ productId: 'p-1', variantId: null, qty: 1 }]);
    mocks.prisma.product.findMany.mockResolvedValue([{
      id: 'p-1',
      name: 'Demo',
      price: 10000,
      stockQty: 10,
      variants: [],
    }]);
    mocks.prisma.storePaymentMethod.findFirst.mockResolvedValue(null);

    await expect(
      createShopCheckoutOrder({
        customerId: 'c-1',
        tenantId: 't-1',
        storeId: 's-1',
        body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 0 },
      })
    ).rejects.toThrow('Payment method unavailable');
  });

  it('throws when stock is insufficient', async () => {
    mocks.prisma.cartItem.findMany.mockResolvedValue([{ productId: 'p-1', variantId: null, qty: 5 }]);
    mocks.prisma.product.findMany.mockResolvedValue([{
      id: 'p-1',
      name: 'Low stock item',
      price: 10000,
      stockQty: 1,
      variants: [],
    }]);

    await expect(
      createShopCheckoutOrder({
        customerId: 'c-1',
        tenantId: 't-1',
        storeId: 's-1',
        body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 0 },
      })
    ).rejects.toThrow('Not enough stock for Low stock item');
  });

  it('creates order and clears cart on success', async () => {
    mocks.prisma.cartItem.findMany.mockResolvedValue([{ productId: 'p-1', variantId: null, qty: 2 }]);
    mocks.prisma.product.findMany.mockResolvedValue([{
      id: 'p-1',
      name: 'Demo',
      price: 15000,
      stockQty: 10,
      variants: [],
    }]);
    mocks.prisma.storePaymentMethod.findFirst.mockResolvedValue({
      id: 'pm-1',
      provider: 'CASH',
      code: 'cash',
      title: 'Cash',
      description: null,
      instructions: null,
      meta: null,
    });
    mocks.prepareOrderPayment.mockReturnValue({
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      paymentMeta: { channel: 'cash' },
    });

    const tx = makeTx({
      order: {
        findFirst: vi.fn().mockResolvedValue({ orderNumber: 10 }),
        create: vi.fn().mockResolvedValue({ id: 'o-1', items: [], customer: { id: 'c-1' } }),
      },
    });
    tx.product.findMany.mockResolvedValue([{ id: 'p-1', name: 'Demo', stockQty: 10, variants: [] }]);

    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await createShopCheckoutOrder({
      customerId: 'c-1',
      tenantId: 't-1',
      storeId: 's-1',
      body: {
        deliveryType: 'PICKUP',
        loyaltyPointsToUse: 0,
        note: 'test',
      },
    });

    expect(result).toMatchObject({ id: 'o-1' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.order.create).toHaveBeenCalledTimes(1);
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { customerId: 'c-1', storeId: 's-1' } });
  });

  it('reads loyalty balance inside transaction (not outside) to prevent negative balance race', async () => {
    mocks.prisma.cartItem.findMany.mockResolvedValue([{ productId: 'p-1', variantId: null, qty: 1 }]);
    mocks.prisma.product.findMany.mockResolvedValue([{
      id: 'p-1', name: 'Item', price: 100000, stockQty: 10, variants: [],
    }]);
    mocks.prisma.storePaymentMethod.findFirst.mockResolvedValue({
      id: 'pm-1', provider: 'CASH', code: 'cash', title: 'Cash',
      description: null, instructions: null, meta: null,
    });
    mocks.prepareOrderPayment.mockReturnValue({
      paymentMethod: 'CASH', paymentStatus: 'PENDING', paymentMeta: {},
    });

    const tx = makeTx({
      order: {
        findFirst: vi.fn().mockResolvedValue({ orderNumber: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'o-3', items: [], customer: {} }),
      },
    });
    tx.product.findMany.mockResolvedValue([{ id: 'p-1', name: 'Item', stockQty: 10, variants: [] }]);
    // Tx sees fresh balance of 50 (after a concurrent checkout consumed points)
    tx.loyaltyConfig.findUnique.mockResolvedValue({
      isEnabled: true, maxDiscountPct: 20, pointValue: 1, minPointsToRedeem: 1,
    });
    tx.customer.findUnique.mockResolvedValue({ loyaltyPoints: 50 });
    tx.customer.update.mockResolvedValue({ loyaltyPoints: 30 });

    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await createShopCheckoutOrder({
      customerId: 'c-1', tenantId: 't-1', storeId: 's-1',
      body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 80 },
    });

    // loyalty data must have come from tx, not the outer prisma mock
    expect(mocks.prisma.loyaltyConfig.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.customer.findUnique).not.toHaveBeenCalled();
    expect(tx.loyaltyConfig.findUnique).toHaveBeenCalledWith({ where: { tenantId: 't-1' } });
    expect(tx.customer.findUnique).toHaveBeenCalledWith({ where: { id: 'c-1' } });

    // capped at min(requested=80, balance=50, maxByDiscount=20000) → 20000 but
    // balance=50 is the binding constraint → 50 pts used, discount = 50 UZS
    const createCall = tx.order.create.mock.calls[0][0];
    expect(createCall.data.loyaltyPointsUsed).toBe(50);
    expect(createCall.data.loyaltyDiscount).toBe(50);
  });

  it('acquires advisory lock before reading last orderNumber', async () => {
    mocks.prisma.cartItem.findMany.mockResolvedValue([{ productId: 'p-1', variantId: null, qty: 1 }]);
    mocks.prisma.product.findMany.mockResolvedValue([{
      id: 'p-1', name: 'Item', price: 5000, stockQty: 10, variants: [],
    }]);
    mocks.prisma.storePaymentMethod.findFirst.mockResolvedValue({
      id: 'pm-1', provider: 'CASH', code: 'cash', title: 'Cash',
      description: null, instructions: null, meta: null,
    });
    mocks.prepareOrderPayment.mockReturnValue({
      paymentMethod: 'CASH', paymentStatus: 'PENDING', paymentMeta: {},
    });

    const callOrder: string[] = [];
    const tx = makeTx({
      order: {
        findFirst: vi.fn().mockImplementation(async () => {
          callOrder.push('findFirst');
          return { orderNumber: 5 };
        }),
        create: vi.fn().mockResolvedValue({ id: 'o-2', items: [], customer: {} }),
      },
    });
    tx.product.findMany.mockResolvedValue([{ id: 'p-1', name: 'Item', stockQty: 10, variants: [] }]);
    (tx.$executeRaw as any).mockImplementation(async () => {
      callOrder.push('lock');
      return 1;
    });

    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await createShopCheckoutOrder({
      customerId: 'c-1', tenantId: 't-1', storeId: 's-1',
      body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 0 },
    });

    expect(callOrder[0]).toBe('lock');
    expect(callOrder[1]).toBe('findFirst');
  });

  it('applies PERCENT promo code discount and increments usedCount', async () => {
    mocks.prisma.cartItem.findMany.mockResolvedValue([{ productId: 'p-1', variantId: null, qty: 1 }]);
    mocks.prisma.product.findMany.mockResolvedValue([{
      id: 'p-1', name: 'Item', price: 100000, stockQty: 10, variants: [],
    }]);
    mocks.prisma.storePaymentMethod.findFirst.mockResolvedValue({
      id: 'pm-1', provider: 'CASH', code: 'cash', title: 'Cash',
      description: null, instructions: null, meta: null,
    });
    mocks.prepareOrderPayment.mockReturnValue({
      paymentMethod: 'CASH', paymentStatus: 'PENDING', paymentMeta: {},
    });

    const tx = makeTx({
      order: {
        findFirst: vi.fn().mockResolvedValue({ orderNumber: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'o-promo', items: [], customer: {} }),
      },
    });
    tx.product.findMany.mockResolvedValue([{ id: 'p-1', name: 'Item', stockQty: 10, variants: [] }]);
    tx.promoCode.findFirst.mockResolvedValue({
      id: 'promo-1', type: 'PERCENT', value: 10, isActive: true,
      expiresAt: null, maxUses: null, usedCount: 5, minOrderAmount: null,
    });

    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await createShopCheckoutOrder({
      customerId: 'c-1', tenantId: 't-1', storeId: 's-1',
      body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 0, promoCodeId: 'promo-1' },
    });

    const createCall = tx.order.create.mock.calls[0][0];
    expect(createCall.data.promoDiscount).toBe(10000); // 10% of 100000
    expect(createCall.data.promoCodeId).toBe('promo-1');
    expect(createCall.data.total).toBe(90000); // 100000 - 10000
    expect(tx.promoCode.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: { usedCount: { increment: 1 } },
    });
  });
});
