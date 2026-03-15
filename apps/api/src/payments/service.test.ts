import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    order: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@prisma/client', () => ({}));

import { applyOrderPaymentStatus } from './service.js';

// applyOrderPaymentStatus receives prisma as first arg — use the mock directly
const mockPrisma = mocks.prisma as any;

describe('applyOrderPaymentStatus', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);

    await expect(
      applyOrderPaymentStatus(mockPrisma, { orderId: 'o-1', status: 'PAID' })
    ).rejects.toThrow('ORDER_NOT_FOUND');
  });

  it('throws ORDER_NOT_FOUND when tenantId does not match', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null); // Prisma returns null when where has tenantId mismatch

    await expect(
      applyOrderPaymentStatus(mockPrisma, { orderId: 'o-1', tenantId: 'wrong-tenant', status: 'PAID' })
    ).rejects.toThrow('ORDER_NOT_FOUND');
  });

  it('throws BAD_PAYMENT_TRANSITION for PENDING → REFUNDED', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o-1', paymentStatus: 'PENDING', paymentMeta: null });

    await expect(
      applyOrderPaymentStatus(mockPrisma, { orderId: 'o-1', status: 'REFUNDED' })
    ).rejects.toThrow('BAD_PAYMENT_TRANSITION:PENDING:REFUNDED');
  });

  it('throws BAD_PAYMENT_TRANSITION for REFUNDED → PAID', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o-1', paymentStatus: 'REFUNDED', paymentMeta: null });

    await expect(
      applyOrderPaymentStatus(mockPrisma, { orderId: 'o-1', status: 'PAID' })
    ).rejects.toThrow('BAD_PAYMENT_TRANSITION:REFUNDED:PAID');
  });

  it('allows same-status transition (idempotent)', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o-1', paymentStatus: 'PAID', paymentMeta: {} });
    mockPrisma.order.update.mockResolvedValue({ id: 'o-1', paymentStatus: 'PAID' });

    await expect(
      applyOrderPaymentStatus(mockPrisma, { orderId: 'o-1', status: 'PAID' })
    ).resolves.not.toThrow();
  });

  it('updates PENDING → PAID and merges meta', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({
      id: 'o-1',
      paymentStatus: 'PENDING',
      paymentMeta: { channel: 'click' },
    });
    mockPrisma.order.update.mockResolvedValue({ id: 'o-1', paymentStatus: 'PAID' });

    await applyOrderPaymentStatus(mockPrisma, {
      orderId: 'o-1',
      status: 'PAID',
      paymentRef: 'ref-42',
      metaPatch: { provider: 'CLICK', lastProviderEventId: 'evt-1' },
    });

    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o-1' },
      data: {
        paymentStatus: 'PAID',
        paymentMeta: expect.objectContaining({
          channel: 'click',        // existing meta preserved
          provider: 'CLICK',        // patch applied
          lastProviderEventId: 'evt-1',
          paymentRef: 'ref-42',
          lastPaymentStatusAt: expect.any(String),
        }),
      },
    });
  });

  it('updates PAID → REFUNDED', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o-1', paymentStatus: 'PAID', paymentMeta: {} });
    mockPrisma.order.update.mockResolvedValue({ id: 'o-1', paymentStatus: 'REFUNDED' });

    const result = await applyOrderPaymentStatus(mockPrisma, { orderId: 'o-1', status: 'REFUNDED' });

    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'REFUNDED' }) })
    );
    expect(result.paymentStatus).toBe('REFUNDED');
  });

  it('handles null paymentMeta gracefully', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o-1', paymentStatus: 'PENDING', paymentMeta: null });
    mockPrisma.order.update.mockResolvedValue({ id: 'o-1', paymentStatus: 'PAID' });

    await applyOrderPaymentStatus(mockPrisma, { orderId: 'o-1', status: 'PAID' });

    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMeta: expect.objectContaining({ lastPaymentStatusAt: expect.any(String) }),
        }),
      })
    );
  });

  it('filters by tenantId when provided', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o-1', paymentStatus: 'PENDING', paymentMeta: null });
    mockPrisma.order.update.mockResolvedValue({ id: 'o-1', paymentStatus: 'PAID' });

    await applyOrderPaymentStatus(mockPrisma, { orderId: 'o-1', tenantId: 't-1', status: 'PAID' });

    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'o-1', tenantId: 't-1' },
    });
  });
});
