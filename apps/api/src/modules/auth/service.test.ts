import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';

const mocks = vi.hoisted(() => ({
  bcryptHash: vi.fn(),
  bcryptCompare: vi.fn(),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    tenant: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('bcrypt', () => ({
  default: { hash: mocks.bcryptHash, compare: mocks.bcryptCompare },
}));

vi.mock('../../lib/jwt.js', () => ({
  signAccessToken: mocks.signAccessToken,
  signRefreshToken: mocks.signRefreshToken,
  verifyRefreshToken: mocks.verifyRefreshToken,
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import { AuthServiceError, login, refresh, register, createTeamUser, updateTeamUser } from './service.js';

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws EMAIL_ALREADY_REGISTERED when email exists', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'u-1' });

    await expect(
      register({
        email: 'owner@test.uz',
        password: 'secret123',
        name: 'Owner',
        tenantName: 'Demo',
        tenantSlug: 'demo',
      })
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('returns auth payload on valid login', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      tenantId: 't-1',
      role: 'OWNER',
      email: 'owner@test.uz',
      name: 'Owner',
      passwordHash: 'hash',
      isActive: true,
      tenant: { id: 't-1', name: 'Demo', slug: 'demo', plan: 'FREE' },
    });
    mocks.bcryptCompare.mockResolvedValue(true);
    mocks.signAccessToken.mockResolvedValue('access-1');
    mocks.signRefreshToken.mockResolvedValue('refresh-1');

    const result = await login({ email: 'owner@test.uz', password: 'secret123' });

    expect(result).toMatchObject({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: expect.objectContaining({ id: 'u-1', email: 'owner@test.uz', name: 'Owner', role: 'OWNER' }),
      tenant: { id: 't-1', name: 'Demo', slug: 'demo', plan: 'FREE' },
    });
  });

  it('throws INVALID_CREDENTIALS on wrong password', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ isActive: true, passwordHash: 'hash' });
    mocks.bcryptCompare.mockResolvedValue(false);

    await expect(login({ email: 'owner@test.uz', password: 'bad' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('throws USER_NOT_FOUND on refresh for inactive user', async () => {
    mocks.verifyRefreshToken.mockResolvedValue({ userId: 'u-1' });
    mocks.prisma.user.findUnique.mockResolvedValue({ isActive: false });

    await expect(refresh('token')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('maps P2002 email constraint to EMAIL_ALREADY_REGISTERED on concurrent register', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);
    mocks.bcryptHash.mockResolvedValue('hash');

    const p2002 = new PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: { target: ['email'] },
    });
    mocks.prisma.$transaction.mockRejectedValue(p2002);

    await expect(
      register({ email: 'owner@test.uz', password: 'secret123', name: 'Owner', tenantName: 'Demo', tenantSlug: 'demo' })
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('maps P2002 slug constraint to TENANT_SLUG_TAKEN on concurrent register', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);
    mocks.bcryptHash.mockResolvedValue('hash');

    const p2002 = new PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: { target: ['slug'] },
    });
    mocks.prisma.$transaction.mockRejectedValue(p2002);

    await expect(
      register({ email: 'owner@test.uz', password: 'secret123', name: 'Owner', tenantName: 'Demo', tenantSlug: 'demo' })
    ).rejects.toMatchObject({ code: 'TENANT_SLUG_TAKEN' });
  });

  // ─── createTeamUser — privilege escalation guard ──────────────────────────

  describe('createTeamUser — permission clamping', () => {
    const baseInput = {
      actorUserId: 'actor-1',
      tenantId: 't-1',
      email: 'new@test.uz',
      password: 'pass123',
      name: 'New User',
      role: 'OPERATOR' as const,
    };

    it('OWNER can grant any permission including manageBilling', async () => {
      mocks.prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'OWNER', permissions: null, isActive: true }) // actor
        .mockResolvedValueOnce(null); // email check
      mocks.bcryptHash.mockResolvedValue('hash');
      mocks.prisma.user.create.mockResolvedValue({
        id: 'u-new', email: 'new@test.uz', name: 'New User', role: 'OPERATOR',
        isActive: true, permissions: { manageBilling: true }, createdAt: new Date(), updatedAt: new Date(),
      });

      await createTeamUser({ ...baseInput, permissions: { manageBilling: true } });

      const createCall = mocks.prisma.user.create.mock.calls[0][0];
      expect(createCall.data.permissions.manageBilling).toBe(true);
    });

    it('OPERATOR cannot elevate permissions beyond their own', async () => {
      // Actor has only manageCatalog + manageOrders
      mocks.prisma.user.findUnique
        .mockResolvedValueOnce({
          role: 'OPERATOR',
          permissions: { manageCatalog: true, manageOrders: true, manageCustomers: false,
                        manageMarketing: false, manageSettings: false, manageBilling: false,
                        manageUsers: true, viewReports: false },
          isActive: true,
        })
        .mockResolvedValueOnce(null);
      mocks.bcryptHash.mockResolvedValue('hash');
      mocks.prisma.user.create.mockResolvedValue({
        id: 'u-new', email: 'new@test.uz', name: 'New User', role: 'OPERATOR',
        isActive: true, permissions: {}, createdAt: new Date(), updatedAt: new Date(),
      });

      // Actor tries to grant manageBilling and manageSettings
      await createTeamUser({ ...baseInput, permissions: { manageBilling: true, manageSettings: true } });

      const createCall = mocks.prisma.user.create.mock.calls[0][0];
      // manageBilling and manageSettings should be clamped to false (actor doesn't have them)
      expect(createCall.data.permissions.manageBilling).toBe(false);
      expect(createCall.data.permissions.manageSettings).toBe(false);
      // permissions actor has should pass through
      expect(createCall.data.permissions.manageCatalog).toBe(true);
    });

    it('OPERATOR cannot grant MANAGER role', async () => {
      mocks.prisma.user.findUnique.mockResolvedValueOnce({
        role: 'OPERATOR', permissions: { manageUsers: true }, isActive: true,
      });

      await expect(
        createTeamUser({ ...baseInput, role: 'MANAGER' })
      ).rejects.toThrow('FORBIDDEN');
    });

    it('MANAGER can grant any permission to OPERATOR', async () => {
      mocks.prisma.user.findUnique
        .mockResolvedValueOnce({ role: 'MANAGER', permissions: null, isActive: true })
        .mockResolvedValueOnce(null);
      mocks.bcryptHash.mockResolvedValue('hash');
      mocks.prisma.user.create.mockResolvedValue({
        id: 'u-new', email: 'new@test.uz', name: 'New User', role: 'OPERATOR',
        isActive: true, permissions: { manageBilling: true }, createdAt: new Date(), updatedAt: new Date(),
      });

      await createTeamUser({ ...baseInput, permissions: { manageBilling: true, manageSettings: true } });

      const createCall = mocks.prisma.user.create.mock.calls[0][0];
      // MANAGER is not clamped
      expect(createCall.data.permissions.manageBilling).toBe(true);
      expect(createCall.data.permissions.manageSettings).toBe(true);
    });
  });

  // ─── updateTeamUser — permission clamping ────────────────────────────────

  describe('updateTeamUser — permission clamping', () => {
    it('OPERATOR cannot self-escalate via updateTeamUser', async () => {
      mocks.prisma.user.findUnique.mockResolvedValueOnce({
        role: 'OPERATOR',
        permissions: { manageCatalog: true, manageOrders: true, manageCustomers: false,
                      manageMarketing: false, manageSettings: false, manageBilling: false,
                      manageUsers: true, viewReports: false },
        isActive: true,
      });
      mocks.prisma.user.findFirst.mockResolvedValueOnce({
        id: 'target-2', role: 'OPERATOR', permissions: {},
      });
      mocks.prisma.user.update.mockResolvedValue({
        id: 'target-2', email: 't@test.uz', name: 'T', role: 'OPERATOR',
        isActive: true, permissions: {}, createdAt: new Date(), updatedAt: new Date(),
      });

      await updateTeamUser({
        actorUserId: 'actor-1',
        tenantId: 't-1',
        targetUserId: 'target-2',
        permissions: { manageBilling: true, manageSettings: true },
      });

      const updateCall = mocks.prisma.user.update.mock.calls[0][0];
      expect(updateCall.data.permissions.manageBilling).toBe(false);
      expect(updateCall.data.permissions.manageSettings).toBe(false);
    });
  });
});
