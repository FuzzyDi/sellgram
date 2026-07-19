import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    catalogSnapshot: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mocks.prisma }));

import { cleanupOldCatalogSnapshots } from './cleanup-old-catalog-snapshots.js';

describe('cleanup-old-catalog-snapshots.cleanupOldCatalogSnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when there are no snapshots at all', async () => {
    mocks.prisma.catalogSnapshot.findMany.mockResolvedValueOnce([]);
    const count = await cleanupOldCatalogSnapshots();
    expect(count).toBe(0);
    expect(mocks.prisma.catalogSnapshot.deleteMany).not.toHaveBeenCalled();
  });

  it('processes each distinct storeId, keeping the latest 10 versions and deleting the rest past 30 days', async () => {
    mocks.prisma.catalogSnapshot.findMany
      .mockResolvedValueOnce([{ storeId: 's-1' }, { storeId: 's-2' }]) // distinct storeIds
      .mockResolvedValueOnce([{ id: 'snap-10' }, { id: 'snap-9' }]) // top 10 for s-1
      .mockResolvedValueOnce([{ id: 'snap-x' }]); // top 10 for s-2
    mocks.prisma.catalogSnapshot.deleteMany
      .mockResolvedValueOnce({ count: 3 }) // deleted for s-1
      .mockResolvedValueOnce({ count: 0 }); // deleted for s-2

    const count = await cleanupOldCatalogSnapshots();

    expect(count).toBe(3);
    expect(mocks.prisma.catalogSnapshot.findMany).toHaveBeenCalledWith({
      distinct: ['storeId'],
      select: { storeId: true },
    });
    expect(mocks.prisma.catalogSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 's-1' }, orderBy: { version: 'desc' }, take: 10 })
    );
    expect(mocks.prisma.catalogSnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        storeId: 's-1',
        id: { notIn: ['snap-10', 'snap-9'] },
        createdAt: { lt: expect.any(Date) },
      },
    });
    expect(mocks.prisma.catalogSnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        storeId: 's-2',
        id: { notIn: ['snap-x'] },
        createdAt: { lt: expect.any(Date) },
      },
    });
  });

  it('uses a 30-day cutoff', async () => {
    mocks.prisma.catalogSnapshot.findMany
      .mockResolvedValueOnce([{ storeId: 's-1' }])
      .mockResolvedValueOnce([]);
    mocks.prisma.catalogSnapshot.deleteMany.mockResolvedValueOnce({ count: 0 });

    await cleanupOldCatalogSnapshots();

    const cutoff = mocks.prisma.catalogSnapshot.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const daysAgo = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeCloseTo(30, 1);
  });
});
