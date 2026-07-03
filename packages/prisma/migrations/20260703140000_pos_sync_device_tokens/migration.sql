-- POS Sync activate/token contract gap (docs/POS_SYNC_API.md §7): device
-- refresh token credential plus device-reported identity fields, kept
-- separate from the admin-set name/deviceType on pos_devices.

-- AlterTable
ALTER TABLE "pos_devices" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "deviceFingerprint" TEXT,
ADD COLUMN     "refreshTokenHash" TEXT,
ADD COLUMN     "refreshTokenPrefix" TEXT,
ADD COLUMN     "reportedDeviceName" TEXT,
ADD COLUMN     "reportedDeviceType" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_refreshTokenHash_key" ON "pos_devices"("refreshTokenHash");
