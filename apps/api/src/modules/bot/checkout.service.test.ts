import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareOrderPayment: vi.fn(),
  prisma: {
    cartItem: { findMany: vi.fn(), deleteMany: vi.fn() },
    product: { findFirst: vi.fn() },
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
    order: { findFirst: vi.fn(), create: vi.fn() },
    customer: { update: vi.fn().mockResolvedValue({}) },
    orderStatusLog: { create: vi.fn().mockResolvedValue({}) },
    loyaltyTransaction: { create: vi.fn().mockResolvedValue({}) },
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
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: 'p-1',
      name: 'Demo',
      price: 10000,
      stockQty: 10,
      variants: [],
    });
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
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: 'p-1',
      name: 'Low stock item',
      price: 10000,
      stockQty: 1,
      variants: [],
    });

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
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: 'p-1',
      name: 'Demo',
      price: 15000,
      stockQty: 10,
      variants: [],
    });
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

  it('acquires advisory lock before reading last orderNumber', async () => {
    mocks.prisma.cartItem.findMany.mockResolvedValue([{ productId: 'p-1', variantId: null, qty: 1 }]);
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: 'p-1', name: 'Item', price: 5000, stockQty: 10, variants: [],
    });
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
});
