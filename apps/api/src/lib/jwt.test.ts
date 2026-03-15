import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

vi.mock('../config/index.js', () => ({ getConfig: mocks.getConfig }));

import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt.js';
import {
  signSystemToken,
  verifySystemToken,
} from './system-jwt.js';

const BASE_CONFIG = {
  JWT_SECRET: 'test-access-secret-at-least-32-chars-long!!',
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars-long!!',
  SYSTEM_JWT_SECRET: 'test-system-secret-at-least-32-chars-long!!',
};

describe('jwt', () => {
  beforeEach(() => {
    mocks.getConfig.mockReturnValue(BASE_CONFIG);
  });

  describe('access token', () => {
    it('round-trips payload correctly', async () => {
      const payload = { userId: 'u-1', tenantId: 't-1', email: 'a@b.com', role: 'OWNER' as const, tenantSlug: 'slug' };
      const token = await signAccessToken(payload);
      const decoded = await verifyAccessToken(token);
      expect(decoded.userId).toBe('u-1');
      expect(decoded.tenantId).toBe('t-1');
      expect(decoded.role).toBe('OWNER');
    });

    it('rejects a token signed with the wrong secret', async () => {
      const payload = { userId: 'u-1', tenantId: 't-1', email: 'a@b.com', role: 'OWNER' as const, tenantSlug: 'slug' };
      const token = await signAccessToken(payload);

      // Swap to different secret
      mocks.getConfig.mockReturnValue({ ...BASE_CONFIG, JWT_SECRET: 'completely-different-secret-value!!' });
      await expect(verifyAccessToken(token)).rejects.toThrow();
    });

    it('rejects a refresh token presented as access token', async () => {
      const payload = { userId: 'u-1', tenantId: 't-1', email: 'a@b.com', role: 'OWNER' as const, tenantSlug: 'slug' };
      const refreshToken = await signRefreshToken(payload);
      // refresh uses a different key — should fail
      await expect(verifyAccessToken(refreshToken)).rejects.toThrow();
    });
  });

  describe('refresh token', () => {
    it('round-trips payload correctly', async () => {
      const payload = { userId: 'u-2', tenantId: 't-2', email: 'b@c.com', role: 'MANAGER' as const, tenantSlug: 'slug2' };
      const token = await signRefreshToken(payload);
      const decoded = await verifyRefreshToken(token);
      expect(decoded.userId).toBe('u-2');
      expect(decoded.role).toBe('MANAGER');
    });

    it('rejects a tampered token', async () => {
      const payload = { userId: 'u-1', tenantId: 't-1', email: 'a@b.com', role: 'OWNER' as const, tenantSlug: 'slug' };
      const token = await signRefreshToken(payload);
      // Tamper with the signature segment
      const parts = token.split('.');
      parts[2] = parts[2].slice(0, -4) + 'XXXX';
      await expect(verifyRefreshToken(parts.join('.'))).rejects.toThrow();
    });
  });

  describe('system token', () => {
    it('round-trips payload correctly', async () => {
      const payload = { type: 'system_admin' as const, adminId: 'sa-1', email: 'admin@system.com' };
      const token = await signSystemToken(payload);
      const decoded = await verifySystemToken(token);
      expect(decoded.type).toBe('system_admin');
      expect(decoded.adminId).toBe('sa-1');
    });

    it('falls back to JWT_SECRET when SYSTEM_JWT_SECRET is absent', async () => {
      const config = { ...BASE_CONFIG, SYSTEM_JWT_SECRET: '' };
      mocks.getConfig.mockReturnValue(config);

      const payload = { type: 'system_admin' as const, adminId: 'sa-1', email: 'admin@system.com' };
      const token = await signSystemToken(payload);
      const decoded = await verifySystemToken(token);
      expect(decoded.adminId).toBe('sa-1');
    });

    it('rejects an access token presented as system token', async () => {
      const accessPayload = { userId: 'u-1', tenantId: 't-1', email: 'a@b.com', role: 'OWNER' as const, tenantSlug: 'slug' };
      const accessToken = await signAccessToken(accessPayload);
      // SYSTEM_JWT_SECRET !== JWT_SECRET — should fail
      await expect(verifySystemToken(accessToken)).rejects.toThrow();
    });
  });
});
