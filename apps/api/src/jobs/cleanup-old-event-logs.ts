import prisma from '../lib/prisma.js';

// Retention policy for pure operational/activity logs — no legal
// retention requirement (unlike FiscalEvent, see
// cleanup-old-fiscal-events.ts), just storage/performance hygiene as
// these tables grow unbounded. 12 months, per explicit business decision.
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

const TABLES = [
  ['shiftEvent', 'createdAt'],
  ['posOperatorEvent', 'createdAt'],
  ['posPaymentEvent', 'createdAt'],
  ['saleEvent', 'createdAt'],
  ['stockEvent', 'createdAt'],
  ['orderStatusLog', 'createdAt'],
  ['tenantAuditLog', 'createdAt'],
  ['systemAuditLog', 'createdAt'],
] as const;

export async function cleanupOldEventLogs(): Promise<Record<string, number>> {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  const counts: Record<string, number> = {};
  for (const [model, field] of TABLES) {
    const result = await (prisma[model] as any).deleteMany({
      where: { [field]: { lt: cutoff } },
    });
    counts[model] = result.count;
  }
  return counts;
}

export function startEventLogCleanupJob(): void {
  // Run once shortly after startup, then once a day — same shape as
  // jobs/cleanup-old-catalog-snapshots.ts's startCatalogSnapshotCleanupJob.
  setTimeout(() => void runCleanup(), 60_000);
  setInterval(() => void runCleanup(), 24 * 60 * 60 * 1000);
}

async function runCleanup(): Promise<void> {
  try {
    const counts = await cleanupOldEventLogs();
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (total > 0) {
      console.log(`[cleanup-old-event-logs] purged ${total} row(s) past the ${RETENTION_MS / 86_400_000}-day retention window:`, counts);
    }
  } catch (err) {
    console.error('[cleanup-old-event-logs] failed:', err);
  }
}
