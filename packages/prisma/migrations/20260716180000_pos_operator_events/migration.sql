-- POS operator audit trail (docs/POS_SYNC_API.md §24,
-- docs/POS_POLICY_ENGINE.md §14.1) — lock/login/switch and failed/
-- blocked PIN attempts. Fully additive: a new table only, no existing
-- column touched.

-- CreateTable
CREATE TABLE "pos_operator_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "operatorId" TEXT,
    "actorId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_operator_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_operator_events_tenantId_deviceId_idx" ON "pos_operator_events"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "pos_operator_events_tenantId_operatorId_idx" ON "pos_operator_events"("tenantId", "operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_operator_events_deviceId_idempotencyKey_key" ON "pos_operator_events"("deviceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "pos_operator_events" ADD CONSTRAINT "pos_operator_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_operator_events" ADD CONSTRAINT "pos_operator_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_operator_events" ADD CONSTRAINT "pos_operator_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
