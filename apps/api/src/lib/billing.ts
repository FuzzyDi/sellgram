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
