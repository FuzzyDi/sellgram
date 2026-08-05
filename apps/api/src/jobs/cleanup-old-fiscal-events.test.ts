import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    fiscalEvent: { deleteMany: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mocks.prisma }));

import { cleanupOldFiscalEvents } from './cleanup-old-fiscal-events.js';

describe('cleanup-old-fiscal-events.cleanupOldFiscalEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes fiscal events older than the retention cutoff and returns the count', async () => {
    mocks.prisma.fiscalEvent.deleteMany.mockResolvedValueOnce({ count: 5 });

    const count = await cleanupOldFiscalEvents();

    expect(count).toBe(5);
    expect(mocks.prisma.fiscalEvent.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });
  });

  it('uses a 1-year cutoff', async () => {
    mocks.prisma.fiscalEvent.deleteMany.mockResolvedValueOnce({ count: 0 });

    await cleanupOldFiscalEvents();

    const cutoff = mocks.prisma.fiscalEvent.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const daysAgo = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeCloseTo(365, 1);
  });
});
