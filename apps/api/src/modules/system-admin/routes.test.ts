import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bcryptCompare: vi.fn(),
  signSystemToken: vi.fn(),
  verifySystemToken: vi.fn(),
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

vi.mock('bcrypt', () => ({
  default: { compare: mocks.bcryptCompare },
}));

vi.mock('../../lib/system-jwt.js', () => ({
  signSystemToken: mocks.signSystemToken,
  verifySystemToken: mocks.verifySystemToken,
}));

vi.mock('../../lib/prisma.js', () => ({
  default: mocks.prisma,
}));

import systemAdminRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  await app.register(systemAdminRoutes);
  return app;
}

describe('system-admin.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs in system admin with valid credentials', async () => {
    mocks.prisma.systemAdmin.findUnique.mockResolvedValue({
      id: 'sa-1',
      email: 'root@sellgram.uz',
      name: 'System Admin',
      isActive: true,
      passwordHash: 'hash',
    });
    mocks.bcryptCompare.mockResolvedValue(true);
    mocks.signSystemToken.mockResolvedValue('token-123');

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'root@sellgram.uz', password: 'secret' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        token: 'token-123',
        admin: { id: 'sa-1', email: 'root@sellgram.uz', name: 'System Admin' },
      },
    });

    await app.close();
  });

  it('returns 400 for invalid tenant plan payload', async () => {
    mocks.verifySystemToken.mockResolvedValue({ type: 'system_admin', adminId: 'sa-1', email: 'root@sellgram.uz' });

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/tenants/t-1/plan',
      headers: { authorization: 'Bearer valid-token' },
      payload: { plan: 'ENTERPRISE' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().success).toBe(false);

    await app.close();
  });

  it('confirms pending invoice and applies tenant plan', async () => {
    mocks.verifySystemToken.mockResolvedValue({ type: 'system_admin', adminId: 'sa-42', email: 'root@sellgram.uz' });
    mocks.prisma.invoice.update.mockResolvedValue({ id: 'inv-1' });
    mocks.prisma.tenant.update.mockResolvedValue({ id: 'tenant-1' });
    // Simulate interactive $transaction: run the callback with a tx that delegates to outer mocks
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        invoice: {
          findUnique: vi.fn().mockResolvedValue({ id: 'inv-1', tenantId: 'tenant-1', plan: 'PRO', status: 'PENDING' }),
          update: mocks.prisma.invoice.update,
        },
        tenant: { update: mocks.prisma.tenant.update },
      };
      return cb(tx);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/invoices/inv-1/confirm',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, message: 'Plan PRO activated' });
    expect(mocks.prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: expect.objectContaining({ status: 'PAID', confirmedBy: 'sa-42' }),
    });
    expect(mocks.prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: expect.objectContaining({ plan: 'PRO' }),
    });

    await app.close();
  });

  it('rejects protected route without bearer token', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ success: false, error: 'Unauthorized' });

    await app.close();
  });
});
