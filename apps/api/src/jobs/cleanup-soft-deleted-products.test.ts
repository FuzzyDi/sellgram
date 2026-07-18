import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    product: { findMany: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mocks.prisma }));

import { cleanupSoftDeletedProducts } from './cleanup-soft-deleted-products.js';

describe('cleanup-soft-deleted-products.cleanupSoftDeletedProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries only products soft-deleted more than 30 days ago', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);
    await cleanupSoftDeletedProducts();
    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith({
      where: { deletedAt: { lt: expect.any(Date) } },
      select: { id: true },
    });
    const cutoff = mocks.prisma.product.findMany.mock.calls[0][0].where.deletedAt.lt as Date;
    const daysAgo = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeCloseTo(30, 1);
  });

  it('physically deletes each eligible tombstone and returns the count', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }]);
    mocks.prisma.product.delete.mockResolvedValue({});

    const count = await cleanupSoftDeletedProducts();

    expect(count).toBe(2);
    expect(mocks.prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
    expect(mocks.prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'p-2' } });
  });

  it('skips a product still referenced by order/purchase history (P2003) without blocking the rest', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }]);
    mocks.prisma.product.delete.mockImplementation(({ where }: any) =>
      where.id === 'p-1' ? Promise.reject({ code: 'P2003' }) : Promise.resolve({})
    );

    const count = await cleanupSoftDeletedProducts();

    expect(count).toBe(1);
    expect(mocks.prisma.product.delete).toHaveBeenCalledTimes(2);
  });

  it('propagates an unexpected error instead of silently swallowing it', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
    mocks.prisma.product.delete.mockRejectedValue(new Error('connection lost'));

    await expect(cleanupSoftDeletedProducts()).rejects.toThrow('connection lost');
  });
});
