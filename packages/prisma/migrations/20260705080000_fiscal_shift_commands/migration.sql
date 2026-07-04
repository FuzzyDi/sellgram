-- Fiscal/shift ingestion + cloud commands, per the real SBG Lite POS
-- Android contract (fiscal/shift/commands v1, 2026-07-04). Roadmap steps
-- 5-6 (docs/SBGCLOUD_ARCHITECTURE.md §13).

-- CreateEnum
CREATE TYPE "FiscalEventType" AS ENUM ('FISCAL_STARTED', 'FISCAL_SUCCESS', 'FISCAL_FAILED', 'FISCAL_UNKNOWN');

-- CreateEnum
CREATE TYPE "FiscalReceiptType" AS ENUM ('SALE', 'REFUND');

-- CreateEnum
CREATE TYPE "ShiftEventType" AS ENUM ('SHIFT_OPENED', 'SHIFT_CLOSED');

-- CreateEnum
CREATE TYPE "CloudCommandType" AS ENUM ('PING', 'REFRESH_CATALOG', 'REFRESH_SETTINGS', 'SHOW_MESSAGE');

-- CreateEnum
CREATE TYPE "CloudCommandStatus" AS ENUM ('PENDING', 'ACKED');

-- CreateEnum
CREATE TYPE "CloudCommandAckStatus" AS ENUM ('DONE', 'FAILED', 'IGNORED', 'RETRY_LATER');

-- CreateTable
CREATE TABLE "fiscal_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" "FiscalEventType" NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "shiftNumber" INTEGER NOT NULL,
    "localReceiptId" TEXT NOT NULL,
    "daemonJournalId" TEXT,
    "receiptNumber" TEXT,
    "receiptType" "FiscalReceiptType",
    "originalLocalReceiptId" TEXT,
    "originalReceiptNumber" TEXT,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "payments" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "createdAtMs" TIMESTAMP(3) NOT NULL,
    "fiscalizedAtMs" TIMESTAMP(3),
    "fiscalStatus" TEXT NOT NULL,
    "printStatus" TEXT NOT NULL,
    "fiscalReceiptNumber" TEXT,
    "fiscalSign" TEXT,
    "fiscalQr" TEXT,
    "ofdStatus" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "rawDaemonResponse" JSONB NOT NULL,
    "rawFiscalPayload" JSONB,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" "ShiftEventType" NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "shiftNumber" INTEGER NOT NULL,
    "shiftState" TEXT NOT NULL,
    "openedAtMs" TIMESTAMP(3),
    "closedAtMs" TIMESTAMP(3),
    "zReportStatus" TEXT NOT NULL,
    "rawDaemonResponse" JSONB NOT NULL,
    "rawShiftPayload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_commands" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "CloudCommandType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "CloudCommandStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ackedAt" TIMESTAMP(3),
    "ackStatus" "CloudCommandAckStatus",
    "ackMessage" TEXT,

    CONSTRAINT "cloud_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_events_deviceId_localReceiptId_idx" ON "fiscal_events"("deviceId", "localReceiptId");

-- CreateIndex
CREATE INDEX "fiscal_events_deviceId_receiptNumber_idx" ON "fiscal_events"("deviceId", "receiptNumber");

-- CreateIndex
CREATE INDEX "fiscal_events_deviceId_receiptType_idempotencyKey_idx" ON "fiscal_events"("deviceId", "receiptType", "idempotencyKey");

-- CreateIndex
CREATE INDEX "fiscal_events_deviceId_shiftNumber_idx" ON "fiscal_events"("deviceId", "shiftNumber");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_events_deviceId_eventId_key" ON "fiscal_events"("deviceId", "eventId");

-- CreateIndex
CREATE INDEX "shift_events_deviceId_shiftNumber_idx" ON "shift_events"("deviceId", "shiftNumber");

-- CreateIndex
CREATE UNIQUE INDEX "shift_events_deviceId_eventId_key" ON "shift_events"("deviceId", "eventId");

-- CreateIndex
CREATE INDEX "cloud_commands_deviceId_status_idx" ON "cloud_commands"("deviceId", "status");

-- AddForeignKey
ALTER TABLE "fiscal_events" ADD CONSTRAINT "fiscal_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_events" ADD CONSTRAINT "fiscal_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_events" ADD CONSTRAINT "fiscal_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_events" ADD CONSTRAINT "shift_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_events" ADD CONSTRAINT "shift_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_events" ADD CONSTRAINT "shift_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_commands" ADD CONSTRAINT "cloud_commands_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_commands" ADD CONSTRAINT "cloud_commands_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
