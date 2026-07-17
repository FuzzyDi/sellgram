-- PosDeviceSettings (docs/POS_SETTINGS_ARCHITECTURE.md §6/§9 steps 5-6)
-- — device-scoped hardware profiles (printer/scanner/pin-pad/scale/
-- customer display), Layer 3 of the three-layer settings split. Fully
-- additive: a new table only, no existing column touched.

-- CreateTable
CREATE TABLE "pos_device_settings" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "printer" JSONB,
    "scanner" JSONB,
    "pinPad" JSONB,
    "scale" JSONB,
    "display" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_device_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_device_settings_deviceId_key" ON "pos_device_settings"("deviceId");

-- AddForeignKey
ALTER TABLE "pos_device_settings" ADD CONSTRAINT "pos_device_settings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
