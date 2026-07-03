/** Grace period after plan expiry before downgrading to FREE (3 days). */
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Returns the effective plan code, treating the plan as FREE only after
 * both the expiry date AND the grace period have passed.
 */
export function getEffectivePlan(plan: string | null | undefined, planExpiresAt: Date | null | undefined): string {
  if (planExpiresAt && planExpiresAt.getTime() + GRACE_MS < Date.now()) {
    return 'FREE';
  }
  return plan ?? 'FREE';
}

/**
 * Date threshold for downgrade jobs: only downgrade tenants whose plan
 * expired before this date (i.e. grace period has elapsed).
 */
export function planDowngradeThreshold(): Date {
  return new Date(Date.now() - GRACE_MS);
}

export type LicenseStatus = 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED' | 'BLOCKED';

/**
 * POS Sync heartbeat licenseStatus (docs/POS_SYNC_API.md §8). BLOCKED takes
 * priority over plan expiry — it's an explicit system-admin action
 * (blockSystemTenant/unblockSystemTenant), not derived from billing dates.
 */
export function getLicenseStatus(tenant: {
  planExpiresAt: Date | null | undefined;
  blockedAt: Date | null | undefined;
}): LicenseStatus {
  if (tenant.blockedAt) return 'BLOCKED';
  if (!tenant.planExpiresAt) return 'ACTIVE';
  const now = Date.now();
  if (now <= tenant.planExpiresAt.getTime()) return 'ACTIVE';
  if (now <= tenant.planExpiresAt.getTime() + GRACE_MS) return 'GRACE_PERIOD';
  return 'EXPIRED';
}
