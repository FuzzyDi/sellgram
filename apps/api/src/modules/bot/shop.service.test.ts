import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    category: { findMany: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    store: { findUnique: vi.fn().mockResolvedValue({ botUsername: null }) },
    cartItem: { findMany: vi.fn() },
    productVariant: { findUnique: vi.fn() },
    deliveryZone: { findMany: vi.fn() },
    storePaymentMethod: { findMany: vi.fn() },
    order: { findMany: vi.fn(), findFirst: vi.fn() },
    customer: { findUnique: vi.fn() },
    loyaltyConfig: { findUnique: vi.fn() },
    loyaltyTransaction: { findMany: vi.fn() },
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import {
  getCustomerCart,
  getCustomerLoyalty,
  getCustomerOrderById,
  getShopCatalog,
  getShopProduct,
  listCustomerOrders,
  listShopDeliveryZones,
  listShopPaymentMethods,
  ShopApiError,
} from './shop.service.js';

describe('shop.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getShopCatalog', () => {
    beforeEach(() => {
      mocks.prisma.category.findMany.mockResolvedValue([{ id: 'c-1' }]);
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
      mocks.prisma.product.count.mockResolvedValue(1);
    });

    it('returns catalog with pagination metadata', async () => {
      const result = await getShopCatalog('tenant-1', 'store-1', { page: 1, pageSize: 20 });
      expect(result.categories).toEqual([{ id: 'c-1' }]);
      expect(result.products).toEqual([{ id: 'p-1' }]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('applies search query filter', async () => {
      await getShopCatalog('tenant-1', 'store-1', { q: 'shoes', page: 1, pageSize: 20 });
      expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ name: { contains: 'shoes', mode: 'insensitive' } }),
        })
      );
    });

    it('applies categoryId filter', async () => {
      await getShopCatalog('tenant-1', 'store-1', { categoryId: 'c-1', page: 1, pageSize: 20 });
      expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'c-1' }),
        })
      );
    });

    it('applies pagination skip/take', async () => {
      mocks.prisma.product.count.mockResolvedValue(40);
      await getShopCatalog('tenant-1', 'store-1', { page: 2, pageSize: 10 });
      expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });

    it('includes out-of-stock products (no stockQty filter)', async () => {
      await getShopCatalog('tenant-1', 'store-1', { page: 1, pageSize: 20 });
      const call = mocks.prisma.product.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('stockQty');
    });
  });

  it('throws PRODUCT_NOT_FOUND when product is missing', async () => {
    mocks.prisma.product.findFirst.mockResolvedValue(null);

    await expect(getShopProduct('tenant-1', 'p-404')).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    } satisfies Partial<ShopApiError>);
  });

  it('returns enriched customer cart', async () => {
    mocks.prisma.cartItem.findMany.mockResolvedValue([{ id: 'ci-1', productId: 'p-1', variantId: null, qty: 2 }]);
    mocks.prisma.product.findMany.mockResolvedValue([{
      id: 'p-1',
      name: 'Demo',
      price: 1000,
      stockQty: 5,
      images: [{ url: '/img.jpg' }],
    }]);

    const result = await getCustomerCart('cust-1', 'store-1');

    expect(result.subtotal).toBe(2000);
    expect(result.items[0]).toMatchObject({ name: 'Demo', qty: 2, total: 2000 });
  });

  it('lists delivery zones and payment methods', async () => {
    mocks.prisma.deliveryZone.findMany.mockResolvedValue([{ id: 'z-1' }]);
    mocks.prisma.storePaymentMethod.findMany.mockResolvedValue([{ id: 'pm-1' }]);

    const zones = await listShopDeliveryZones('tenant-1', 'store-1');
    const methods = await listShopPaymentMethods('tenant-1', 'store-1');

    expect(zones).toEqual([{ id: 'z-1' }]);
    expect(methods).toEqual([{ id: 'pm-1' }]);
  });

  it('lists customer orders', async () => {
    mocks.prisma.order.findMany.mockResolvedValue([{ id: 'o-1' }]);

    const result = await listCustomerOrders('c-1');

    expect(result).toEqual([{ id: 'o-1' }]);
    expect(mocks.prisma.order.findMany).toHaveBeenCalledTimes(1);
  });

  it('throws ORDER_NOT_FOUND when order does not belong to customer', async () => {
    mocks.prisma.order.findFirst.mockResolvedValue(null);

    await expect(getCustomerOrderById('c-1', 'o-404')).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    } satisfies Partial<ShopApiError>);
  });

  it('returns loyalty payload', async () => {
    mocks.prisma.customer.findUnique.mockResolvedValue({ loyaltyPoints: 125 });
    mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({
      pointValue: 100,
      unitAmount: 1000,
      isEnabled: true,
    });
    mocks.prisma.loyaltyTransaction.findMany.mockResolvedValue([{ id: 'lt-1' }]);

    const result = await getCustomerLoyalty('c-1', 't-1');

    expect(result).toEqual({
      balance: 125,
      config: { pointValue: 100, unitAmount: 1000, isEnabled: true },
      transactions: [{ id: 'lt-1' }],
    });
  });
});
