import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bcryptCompare: vi.fn(),
  signSystemToken: vi.fn(),
  prisma: {
    systemAdmin: { findUnique: vi.fn() },
    tenant: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    store: { count: vi.fn(), findMany: vi.fn() },
    invoice: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    order: { count: vi.fn() },
    systemAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  },
}));

vi.mock('bcrypt', () => ({ default: { compare: mocks.bcryptCompare } }));
vi.mock('../../lib/system-jwt.js', () => ({ signSystemToken: mocks.signSystemToken }));
vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import {
  confirmSystemInvoice,
  loginSystemAdmin,
  rejectSystemInvoice,
  updateSystemTenantPlan,
} from './service.js';

describe('system-admin.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs in active system admin', async () => {
    mocks.prisma.systemAdmin.findUnique.mockResolvedValue({
      id: 'sa-1',
      email: 'root@sellgram.uz',
      name: 'System Admin',
      isActive: true,
      passwordHash: 'hash',
    });
    mocks.bcryptCompare.mockResolvedValue(true);
    mocks.signSystemToken.mockResolvedValue('jwt-1');

    const result = await loginSystemAdmin({ email: 'root@sellgram.uz', password: 'secret' });

    expect(result).toEqual({
      token: 'jwt-1',
      admin: { id: 'sa-1', email: 'root@sellgram.uz', name: 'System Admin' },
    });
  });

  it('throws TENANT_NOT_FOUND on plan update', async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(
      updateSystemTenantPlan({ id: 'tenant-404', plan: 'PRO' })
    ).rejects.toThrow('TENANT_NOT_FOUND');
  });

  it('throws INVOICE_NOT_FOUND when confirming non-pending invoice', async () => {
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        invoice: { findUnique: vi.fn().mockResolvedValue({ id: 'inv-1', status: 'PAID' }), update: vi.fn() },
        tenant: { update: vi.fn() },
      };
      return cb(tx);
    });

    await expect(
      confirmSystemInvoice({ id: 'inv-1', confirmedBy: 'sa-1' })
    ).rejects.toThrow('INVOICE_NOT_FOUND');
  });

  it('rejects pending invoice', async () => {
    const txInvoiceUpdate = vi.fn().mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        invoice: {
          findUnique: vi.fn().mockResolvedValue({ id: 'inv-1', status: 'PENDING', tenantId: 't-1', plan: 'FREE', amount: 0 }),
          update: txInvoiceUpdate,
        },
        tenant: { update: vi.fn() },
      };
      return cb(tx);
    });

    await rejectSystemInvoice({ id: 'inv-1', confirmedBy: 'sa-1' });

    expect(txInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: expect.objectContaining({ status: 'CANCELLED', confirmedBy: 'sa-1' }),
    });
  });
});
