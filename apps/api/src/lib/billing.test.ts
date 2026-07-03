import { describe, expect, it } from 'vitest';
import { getLicenseStatus } from './billing.js';

describe('getLicenseStatus', () => {
  it('returns ACTIVE when there is no planExpiresAt', () => {
    expect(getLicenseStatus({ planExpiresAt: null, blockedAt: null })).toBe('ACTIVE');
  });

  it('returns ACTIVE when planExpiresAt is in the future', () => {
    const planExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(getLicenseStatus({ planExpiresAt, blockedAt: null })).toBe('ACTIVE');
  });

  it('returns GRACE_PERIOD when planExpiresAt has passed but is within the 3-day grace window', () => {
    const planExpiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(getLicenseStatus({ planExpiresAt, blockedAt: null })).toBe('GRACE_PERIOD');
  });

  it('returns EXPIRED once the grace window has elapsed', () => {
    const planExpiresAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    expect(getLicenseStatus({ planExpiresAt, blockedAt: null })).toBe('EXPIRED');
  });

  it('returns BLOCKED when blockedAt is set, regardless of plan expiry', () => {
    const planExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(getLicenseStatus({ planExpiresAt, blockedAt: new Date() })).toBe('BLOCKED');
  });
});
