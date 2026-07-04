-- PosDevice.deviceCode: public (non-secret) device identifier, checked
-- against the X-Device-Code header on every authenticated pos-sync
-- endpoint alongside the existing Authorization: Bearer accessToken
-- (docs/POS_SYNC_API.md §4/§22). Nullable — origin (device-generated vs
-- Cloud-issued) is an open question pending Android team confirmation.

-- AlterTable
ALTER TABLE "pos_devices" ADD COLUMN     "deviceCode" TEXT;
