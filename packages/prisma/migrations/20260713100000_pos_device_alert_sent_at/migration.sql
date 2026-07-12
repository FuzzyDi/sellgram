-- Offline-heartbeat alert dedup flag for jobs/pos-device-monitor.ts.
-- Purely additive: one nullable column on "pos_devices", no backfill —
-- alertSentAt is NULL for every pre-existing row (equivalent to "no
-- alert sent yet", which is correct for devices that predate this
-- feature).

-- AlterTable
ALTER TABLE "pos_devices" ADD COLUMN     "alertSentAt" TIMESTAMP(3);
