import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    shiftEvent: { deleteMany: vi.fn() },
    posOperatorEvent: { deleteMany: vi.fn() },
    posPaymentEvent: { deleteMany: vi.fn() },
    saleEvent: { deleteMany: vi.fn() },
    stockEvent: { deleteMany: vi.fn() },
    orderStatusLog: { deleteMany: vi.fn() },
    tenantAuditLog: { deleteMany: vi.fn() },
    systemAuditLog: { deleteMany: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mocks.prisma }));

import { cleanupOldEventLogs } from './cleanup-old-event-logs.js';

describe('cleanup-old-event-logs.cleanupOldEventLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.prisma) as (keyof typeof mocks.prisma)[]) {
      mocks.prisma[key].deleteMany.mockResolvedValue({ count: 0 });
    }
  });

  it('purges every operational-log table past the retention cutoff and reports per-table counts', async () => {
    mocks.prisma.shiftEvent.deleteMany.mockResolvedValueOnce({ count: 2 });
    mocks.prisma.systemAuditLog.deleteMany.mockResolvedValueOnce({ count: 7 });

    const counts = await cleanupOldEventLogs();

    expect(counts).toEqual({
      shiftEvent: 2,
      posOperatorEvent: 0,
      posPaymentEvent: 0,
      saleEvent: 0,
      stockEvent: 0,
      orderStatusLog: 0,
      tenantAuditLog: 0,
      systemAuditLog: 7,
    });
    for (const key of Object.keys(mocks.prisma) as (keyof typeof mocks.prisma)[]) {
      expect(mocks.prisma[key].deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });
    }
  });

  it('uses a 12-month (365-day) cutoff', async () => {
    await cleanupOldEventLogs();

    const cutoff = mocks.prisma.shiftEvent.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const daysAgo = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeCloseTo(365, 1);
  });
});
