import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('@sellgram/shared', () => ({
  canTransition: vi.fn((from: string, to: string) => {
    const allowed: Record<string, string[]> = {
      NEW: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY', 'CANCELLED'],
      READY: ['SHIPPED', 'DELIVERED', 'CANCELLED'],
      SHIPPED: ['DELIVERED'],
      DELIVERED: ['COMPLETED', 'REFUNDED'],
      COMPLETED: ['REFUNDED'],
    };
    return allowed[from]?.includes(to) ?? false;
  }),
}));

import { updateOrderStatus } from './order.service.js';

function makeTx(orderOverrides: any = {}) {
  return {
    order: {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...orderOverrides,
    },
    product: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
    productVariant: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
    customer: { update: vi.fn().mockResolvedValue({ loyaltyPoints: 0 }) },
    orderStatusLog: { create: vi.fn().mockResolvedValue({}) },
    loyaltyConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    loyaltyTransaction: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe('updateOrderStatus', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    const tx = makeTx({ findFirst: vi.fn().mockResolvedValue(null) });
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await expect(
      updateOrderStatus({ orderId: 'o-1', tenantId: 't-1', actorUserId: 'u-1', status: 'CONFIRMED' })
    ).rejects.toThrow('ORDER_NOT_FOUND');
  });

  it('throws BAD_TRANSITION when status transition is invalid', async () => {
    const tx = makeTx({
      findFirst: vi.fn().mockResolvedValue({
        id: 'o-1', status: 'COMPLETED', items: [], customer: { loyaltyPoints: 0 },
        loyaltyPointsUsed: 0, storeId: 's-1',
      }),
    });
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await expect(
      updateOrderStatus({ orderId: 'o-1', tenantId: 't-1', actorUserId: 'u-1', status: 'CONFIRMED' })
    ).rejects.toThrow('BAD_TRANSITION:COMPLETED:CONFIRMED');
  });

  it('throws INSUFFICIENT_STOCK when confirming with low stock (product)', async () => {
    const tx = makeTx({
      findFirst: vi.fn().mockResolvedValue({
        id: 'o-1', status: 'NEW', storeId: 's-1',
        items: [{ productId: 'p-1', variantId: null, qty: 5, name: 'Widget' }],
        customer: { loyaltyPoints: 0 }, loyaltyPointsUsed: 0,
      }),
    });
    tx.product.findMany.mockResolvedValue([{ id: 'p-1', stockQty: 2 }]);
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await expect(
      updateOrderStatus({ orderId: 'o-1', tenantId: 't-1', actorUserId: 'u-1', status: 'CONFIRMED' })
    ).rejects.toThrow('INSUFFICIENT_STOCK:Widget');
  });

  it('decrements stock on CONFIRMED', async () => {
    const tx = makeTx({
      findFirst: vi.fn().mockResolvedValue({
        id: 'o-1', status: 'NEW', storeId: 's-1',
        items: [{ productId: 'p-1', variantId: null, qty: 3, name: 'Widget' }],
        customer: { loyaltyPoints: 0 }, loyaltyPointsUsed: 0,
      }),
    });
    tx.product.findMany.mockResolvedValue([{ id: 'p-1', stockQty: 10 }]);
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await updateOrderStatus({ orderId: 'o-1', tenantId: 't-1', actorUserId: 'u-1', status: 'CONFIRMED' });

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { stockQty: { decrement: 3 } },
    });
  });

  it('returns stock and loyalty points on CANCELLED', async () => {
    const tx = makeTx({
      findFirst: vi.fn().mockResolvedValue({
        id: 'o-1', status: 'CONFIRMED', storeId: 's-1', orderNumber: 42,
        items: [{ productId: 'p-1', variantId: null, qty: 2, name: 'Widget' }],
        customer: { id: 'cust-1', loyaltyPoints: 10 }, customerId: 'cust-1',
        loyaltyPointsUsed: 5,
      }),
    });
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await updateOrderStatus({ orderId: 'o-1', tenantId: 't-1', actorUserId: 'u-1', status: 'CANCELLED' });

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { stockQty: { increment: 2 } },
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      data: { loyaltyPoints: { increment: 5 } },
    });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ADJUST', points: 5 }) })
    );
  });

  it('earns loyalty points on COMPLETED', async () => {
    const tx = makeTx({
      findFirst: vi.fn().mockResolvedValue({
        id: 'o-1', status: 'DELIVERED', storeId: 's-1', orderNumber: 7,
        total: 100000,
        items: [], customer: { id: 'cust-1', loyaltyPoints: 0 }, customerId: 'cust-1',
        loyaltyPointsUsed: 0,
      }),
    });
    tx.loyaltyConfig.findUnique.mockResolvedValue({
      isEnabled: true, unitAmount: 10000, pointsPerUnit: 1,
    });
    tx.customer.update.mockResolvedValue({ loyaltyPoints: 10 });
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await updateOrderStatus({ orderId: 'o-1', tenantId: 't-1', actorUserId: 'u-1', status: 'COMPLETED' });

    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'EARN', points: 10 }) })
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PAID' }) })
    );
  });

  it('writes status log with actorUserId', async () => {
    const tx = makeTx({
      findFirst: vi.fn().mockResolvedValue({
        id: 'o-1', status: 'NEW', storeId: 's-1',
        items: [], customer: { loyaltyPoints: 0 }, loyaltyPointsUsed: 0,
      }),
    });
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await updateOrderStatus({
      orderId: 'o-1', tenantId: 't-1', actorUserId: 'actor-99', status: 'CONFIRMED',
    });

    expect(tx.orderStatusLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ changedBy: 'actor-99', fromStatus: 'NEW', toStatus: 'CONFIRMED' }),
      })
    );
  });

  it('throws ORDER_CONCURRENT_MODIFICATION when another process already changed the status', async () => {
    const tx = makeTx({
      findFirst: vi.fn().mockResolvedValue({
        id: 'o-1', status: 'DELIVERED', storeId: 's-1',
        items: [], customer: { loyaltyPoints: 0 }, customerId: 'cust-1',
        loyaltyPointsUsed: 0, total: 0, orderNumber: 1,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }), // another process won the race
    });
    tx.loyaltyConfig.findUnique.mockResolvedValue(null);
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await expect(
      updateOrderStatus({ orderId: 'o-1', tenantId: 't-1', actorUserId: 'u-1', status: 'COMPLETED' })
    ).rejects.toThrow('ORDER_CONCURRENT_MODIFICATION');
  });

  it('returns storeId from the order', async () => {
    const tx = makeTx({
      findFirst: vi.fn().mockResolvedValue({
        id: 'o-1', status: 'NEW', storeId: 'store-42',
        items: [], customer: { loyaltyPoints: 0 }, loyaltyPointsUsed: 0,
      }),
    });
    mocks.prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    const result = await updateOrderStatus({
      orderId: 'o-1', tenantId: 't-1', actorUserId: 'u-1', status: 'CONFIRMED',
    });

    expect(result).toEqual({ storeId: 'store-42' });
  });
});
