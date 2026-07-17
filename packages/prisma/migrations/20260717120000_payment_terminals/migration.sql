-- PaymentTerminal (docs/POS_SETTINGS_ARCHITECTURE.md §3/§9 step 1) —
-- store-level default / device-level override payment configuration,
-- splitting PosSettings.payload.paymentMethods (a flat string[]) into
-- its own table. Fully additive: a new table only, no existing column
-- touched.

-- CreateTable
CREATE TABLE "payment_terminals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_terminals_storeId_enabled_idx" ON "payment_terminals"("storeId", "enabled");

-- CreateIndex
CREATE INDEX "payment_terminals_deviceId_idx" ON "payment_terminals"("deviceId");

-- AddForeignKey
ALTER TABLE "payment_terminals" ADD CONSTRAINT "payment_terminals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terminals" ADD CONSTRAINT "payment_terminals_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terminals" ADD CONSTRAINT "payment_terminals_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
