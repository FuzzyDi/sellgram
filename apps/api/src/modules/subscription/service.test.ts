import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    tenant: { findUnique: vi.fn(), update: vi.fn() },
    store: { count: vi.fn() },
    product: { count: vi.fn() },
    order: { count: vi.fn() },
    deliveryZone: { count: vi.fn() },
    invoice: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  getConfig: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../config/index.js', () => ({ getConfig: mocks.getConfig }));

import {
  getTenantSubscription,
  submitInvoicePayment,
  upgradeTenantPlan,
} from './service.js';

describe('subscription.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({
      BILLING_BANK_NAME: 'Test Bank',
      BILLING_BANK_ACCOUNT: '123',
      BILLING_RECIPIENT: 'Sellgram LLC',
      BILLING_INN: '111',
      BILLING_MFO: '222',
      BILLING_PAYMENT_NOTE: 'Subscription payment',
      BILLING_EMAIL: 'billing@sellgram.uz',
    });
  });

  it('returns tenant subscription usage', async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ id: 't-1', plan: 'FREE', planExpiresAt: null });
    mocks.prisma.store.count.mockResolvedValue(1);
    mocks.prisma.product.count.mockResolvedValue(10);
    mocks.prisma.order.count.mockResolvedValue(5);
    mocks.prisma.deliveryZone.count.mockResolvedValue(2);

    const result = await getTenantSubscription('t-1');

    expect(result.plan).toBe('FREE');
    expect(result.usage.stores.current).toBe(1);
    expect(result.usage.products.current).toBe(10);
  });

  it('switches to FREE plan without invoice creation', async () => {
    mocks.prisma.tenant.update.mockResolvedValue({ id: 't-1', plan: 'FREE' });

    const result = await upgradeTenantPlan({ tenantId: 't-1', plan: 'FREE' });

    expect(mocks.prisma.tenant.update).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.invoice.create).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Plan switched to FREE' });
  });

  it('creates invoice for paid plan when no pending invoice exists', async () => {
    const createdInvoice = { id: 'inv-1', plan: 'PRO', amount: 149000 };
    // Simulate the $transaction callback: advisory lock, findFirst → null, create
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        invoice: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(createdInvoice),
        },
      };
      return cb(tx);
    });

    const result = await upgradeTenantPlan({ tenantId: 't-1', plan: 'PRO' });

    expect((result as any).invoice).toEqual(createdInvoice);
    expect(result).toHaveProperty('bankDetails.bank', 'Test Bank');
    expect(result).toHaveProperty('message');
  });

  it('returns existing invoice when a pending one already exists', async () => {
    const existingInvoice = { id: 'inv-0', plan: 'PRO', status: 'PENDING', amount: 149000 };
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        invoice: {
          findFirst: vi.fn().mockResolvedValue(existingInvoice),
          create: vi.fn(),
        },
      };
      return cb(tx);
    });

    const result = await upgradeTenantPlan({ tenantId: 't-1', plan: 'PRO' });

    expect((result as any).invoice).toEqual(existingInvoice);
    // No message when returning existing invoice
    expect(result).not.toHaveProperty('message');
  });

  it('throws INVOICE_NOT_FOUND on payment submit for missing invoice', async () => {
    mocks.prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(
      submitInvoicePayment({ tenantId: 't-1', id: 'inv-404', paymentRef: 'pay-ref' })
    ).rejects.toThrow('INVOICE_NOT_FOUND');
  });
});
