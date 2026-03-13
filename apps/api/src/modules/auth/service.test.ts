import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bcryptHash: vi.fn(),
  bcryptCompare: vi.fn(),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
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

import { AuthServiceError, login, refresh, register } from './service.js';

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

    expect(result).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'u-1', email: 'owner@test.uz', name: 'Owner', role: 'OWNER' },
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
});
