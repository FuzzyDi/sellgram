import prisma from '../lib/prisma.js';

// docs/POS_SYNC_API.md §26 — CatalogSnapshot accumulates one row per
// POST /pos-devices/catalog-snapshot call, unbounded. Two independent
// keep conditions, not one: the latest KEEP_LATEST versions per store
// are always kept regardless of age (a device could still be sitting on
// an old `since` within that window), and anything older than
// RETENTION_MS is only actually purged once it's *also* fallen out of
// that window — matching the same 30-day horizon
// GET /pos/v1/catalog/changes uses to decide version_too_old, so a
// snapshot this job would delete could never have been a valid delta
// base anyway.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const KEEP_LATEST = 10;

export async function cleanupOldCatalogSnapshots(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  const stores = await prisma.catalogSnapshot.findMany({
    distinct: ['storeId'],
    select: { storeId: true },
  });

  let deleted = 0;
  for (const { storeId } of stores) {
    const kept = await prisma.catalogSnapshot.findMany({
      where: { storeId },
      orderBy: { version: 'desc' },
      take: KEEP_LATEST,
      select: { id: true },
    });
    const result = await prisma.catalogSnapshot.deleteMany({
      where: {
        storeId,
        id: { notIn: kept.map((s) => s.id) },
        createdAt: { lt: cutoff },
      },
    });
    deleted += result.count;
  }
  return deleted;
}

export function startCatalogSnapshotCleanupJob(): void {
  // Run once shortly after startup, then once a day — same shape as
  // jobs/cleanup-soft-deleted-products.ts's startSoftDeleteCleanupJob.
  setTimeout(() => void runCleanup(), 60_000);
  setInterval(() => void runCleanup(), 24 * 60 * 60 * 1000);
}

async function runCleanup(): Promise<void> {
  try {
    const count = await cleanupOldCatalogSnapshots();
    if (count > 0) {
      console.log(`[cleanup-old-catalog-snapshots] purged ${count} snapshot(s) past the ${KEEP_LATEST}-version / ${RETENTION_MS / 86_400_000}-day retention window`);
    }
  } catch (err) {
    console.error('[cleanup-old-catalog-snapshots] failed:', err);
  }
}
