import prisma from '../lib/prisma.js';

// docs/POS_SYNC_API.md §26 — a soft-deleted Product (deletedAt set,
// DELETE /products/:id) is kept around as a tombstone only so a till
// that's behind on catalog sync can still be told "deleted" via
// GET /pos/v1/catalog/changes. Once a since-snapshot older than this
// horizon is rejected as version_too_old (same 30-day window,
// routes.ts's CATALOG_DELTA_MAX_AGE_MS), no delta computation can ever
// need the tombstone again, so it's safe to physically remove it.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Row-by-row, not a single deleteMany: OrderItem.product and
// PurchaseOrderItem.product have no onDelete on their FK (schema.prisma),
// i.e. Postgres RESTRICT — a product that was ever sold or purchased
// can't be physically deleted while that history exists. A single
// deleteMany would abort the whole statement (deleting nothing) the
// first time it hit one such row; per-row deletes let every other
// eligible tombstone still get purged, and P2003 here is an expected,
// permanent state (the row stays a tombstone indefinitely), not a
// transient failure worth retrying.
export async function cleanupSoftDeletedProducts(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  const candidates = await prisma.product.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
  });

  let deleted = 0;
  for (const { id } of candidates) {
    try {
      await prisma.product.delete({ where: { id } });
      deleted++;
    } catch (err: any) {
      if (err?.code !== 'P2003') throw err;
    }
  }
  return deleted;
}

export function startSoftDeleteCleanupJob(): void {
  // Run once shortly after startup, then once a day — same shape as
  // jobs/pos-device-monitor.ts's startPosDeviceMonitor.
  setTimeout(() => void runCleanup(), 60_000);
  setInterval(() => void runCleanup(), 24 * 60 * 60 * 1000);
}

async function runCleanup(): Promise<void> {
  try {
    const count = await cleanupSoftDeletedProducts();
    if (count > 0) {
      console.log(`[cleanup-soft-deleted-products] purged ${count} product(s) past the ${RETENTION_MS / 86_400_000}-day retention window`);
    }
  } catch (err) {
    console.error('[cleanup-soft-deleted-products] failed:', err);
  }
}
