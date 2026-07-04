-- PosDevice.deviceCode is now unique per tenant (confirmed production
-- flow with the SBG Lite POS Android team, docs/POS_SYNC_API.md §4/§22).
-- NULL is not compared as equal to NULL in a Postgres unique index, so
-- pre-existing rows with deviceCode = NULL are unaffected.

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_tenantId_deviceCode_key" ON "pos_devices"("tenantId", "deviceCode");
