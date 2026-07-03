-- Tenant.blockedAt: first-class signal for system-admin block/unblock,
-- consumed by POS Sync heartbeat's licenseStatus (docs/POS_SYNC_API.md §8).

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "blockedAt" TIMESTAMP(3);
