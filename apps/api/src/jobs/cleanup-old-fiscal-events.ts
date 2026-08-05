import prisma from '../lib/prisma.js';

// Retention policy for fiscal receipt records (FiscalEvent) — explicit
// tenant/business decision, not a technical default: 1 year. FiscalEvent
// holds real fiscal receipt data (fiscalSign/fiscalQr/OFD status) tied to
// SetRetail10 — if the retention requirement for tax records changes,
// this constant is the one place to update.
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export async function cleanupOldFiscalEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  const result = await prisma.fiscalEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

export function startFiscalEventCleanupJob(): void {
  // Run once shortly after startup, then once a day — same shape as
  // jobs/cleanup-old-catalog-snapshots.ts's startCatalogSnapshotCleanupJob.
  setTimeout(() => void runCleanup(), 60_000);
  setInterval(() => void runCleanup(), 24 * 60 * 60 * 1000);
}

async function runCleanup(): Promise<void> {
  try {
    const count = await cleanupOldFiscalEvents();
    if (count > 0) {
      console.log(`[cleanup-old-fiscal-events] purged ${count} fiscal event(s) past the ${RETENTION_MS / 86_400_000}-day retention window`);
    }
  } catch (err) {
    console.error('[cleanup-old-fiscal-events] failed:', err);
  }
}
