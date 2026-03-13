import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    product: { findFirst: vi.fn(), findUnique: vi.fn() },
    cartItem: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import { addCartItem, CartServiceError, removeCartItem, updateCartItemQty } from './cart.service.js';

describe('cart.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws INVALID_INPUT for bad qty', async () => {
    await expect(
      addCartItem({
        customerId: 'c-1',
        tenantId: 't-1',
        storeId: 's-1',
        productId: 'p-1',
        variantId: null,
        qty: 0,
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' } satisfies Partial<CartServiceError>);
  });

  it('creates cart item when it does not exist', async () => {
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: 'p-1',
      stockQty: 10,
      isActive: true,
      variants: [],
    });
    mocks.prisma.cartItem.findFirst.mockResolvedValue(null);

    const result = await addCartItem({
      customerId: 'c-1',
      tenantId: 't-1',
      storeId: 's-1',
      productId: 'p-1',
      variantId: null,
      qty: 2,
    });

    expect(result.message).toBe('Added to cart');
    expect(mocks.prisma.cartItem.create).toHaveBeenCalledTimes(1);
  });

  it('updates existing cart item and checks combined stock', async () => {
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: 'p-1',
      stockQty: 3,
      isActive: true,
      variants: [],
    });
    mocks.prisma.cartItem.findFirst.mockResolvedValue({ id: 'ci-1', qty: 2 });

    await expect(
      addCartItem({
        customerId: 'c-1',
        tenantId: 't-1',
        storeId: 's-1',
        productId: 'p-1',
        variantId: null,
        qty: 2,
      })
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH_STOCK' } satisfies Partial<CartServiceError>);
  });

  it('throws ITEM_NOT_FOUND on update missing item', async () => {
    mocks.prisma.cartItem.findFirst.mockResolvedValue(null);

    await expect(
      updateCartItemQty({ customerId: 'c-1', itemId: 'missing', qty: 1 })
    ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' } satisfies Partial<CartServiceError>);
  });

  it('updates item qty when stock is sufficient', async () => {
    mocks.prisma.cartItem.findFirst.mockResolvedValue({ id: 'ci-1', productId: 'p-1', variantId: null });
    mocks.prisma.product.findUnique.mockResolvedValue({ id: 'p-1', stockQty: 10, isActive: true, variants: [] });

    const result = await updateCartItemQty({ customerId: 'c-1', itemId: 'ci-1', qty: 5 });

    expect(result.message).toBe('Cart updated');
    expect(mocks.prisma.cartItem.update).toHaveBeenCalledWith({ where: { id: 'ci-1' }, data: { qty: 5 } });
  });

  it('deletes item on qty=0', async () => {
    mocks.prisma.cartItem.findFirst.mockResolvedValue({ id: 'ci-1', productId: 'p-1', variantId: null });

    const result = await updateCartItemQty({ customerId: 'c-1', itemId: 'ci-1', qty: 0 });

    expect(result.message).toBe('Item removed');
    expect(mocks.prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'ci-1' } });
  });

  it('removes cart item', async () => {
    mocks.prisma.cartItem.findFirst.mockResolvedValue({ id: 'ci-1' });

    const result = await removeCartItem({ customerId: 'c-1', itemId: 'ci-1' });

    expect(result.message).toBe('Item removed');
    expect(mocks.prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'ci-1' } });
  });
});
