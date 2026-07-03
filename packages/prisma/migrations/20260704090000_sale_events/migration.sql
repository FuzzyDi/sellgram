-- SaleEvent: append-only cloud-side mirror of locally completed sales,
-- ingested idempotently by unique idempotencyKey (docs/POS_SYNC_API.md
-- §5/§11). Roadmap step 4 (docs/SBGCLOUD_ARCHITECTURE.md §13).

-- CreateEnum
CREATE TYPE "SaleEventType" AS ENUM ('SALE_CREATED', 'SALE_PAID', 'SALE_FISCALIZED', 'SALE_COMPLETED', 'SALE_CANCELLED', 'SALE_REFUNDED', 'SALE_FISCAL_UNKNOWN');

-- CreateEnum
CREATE TYPE "SaleEventStatus" AS ENUM ('FISCALIZED', 'FISCAL_UNKNOWN', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "sale_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "localSaleId" TEXT NOT NULL,
    "localShiftId" TEXT NOT NULL,
    "eventType" "SaleEventType" NOT NULL,
    "status" "SaleEventStatus" NOT NULL,
    "receiptNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_events_idempotencyKey_key" ON "sale_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "sale_events_tenantId_storeId_localSaleId_idx" ON "sale_events"("tenantId", "storeId", "localSaleId");

-- CreateIndex
CREATE INDEX "sale_events_tenantId_occurredAt_idx" ON "sale_events"("tenantId", "occurredAt");

-- AddForeignKey
ALTER TABLE "sale_events" ADD CONSTRAINT "sale_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_events" ADD CONSTRAINT "sale_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_events" ADD CONSTRAINT "sale_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
