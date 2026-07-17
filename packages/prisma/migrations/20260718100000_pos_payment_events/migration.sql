-- PosPaymentEvent (docs/POS_SYNC_API.md §25) — universal payment-provider
-- event stream (UzQR/pinpad/Payme/Click/QR_STATIC/bank transfer/cash),
-- separate from FiscalEvent: this is the payment provider's side of a
-- transaction, FiscalEvent is the fiscal receipt's side. Fully additive:
-- a new table only, no existing column touched.

-- CreateTable
CREATE TABLE "pos_payment_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "providerPaymentId" TEXT,
    "providerInvoiceId" TEXT,
    "providerRefundId" TEXT,
    "saleId" TEXT,
    "refundId" TEXT,
    "fiscalReceiptId" TEXT,
    "terminalId" TEXT,
    "shiftId" INTEGER,
    "cashierId" TEXT,
    "cashierName" TEXT,
    "cashierRole" TEXT,
    "createdAtMs" TIMESTAMP(3),
    "updatedAtMs" TIMESTAMP(3),
    "completedAtMs" TIMESTAMP(3),
    "reason" TEXT,
    "rawProviderStatus" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_payment_events_tenantId_deviceId_idx" ON "pos_payment_events"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "pos_payment_events_tenantId_aggregateId_idx" ON "pos_payment_events"("tenantId", "aggregateId");

-- CreateIndex
CREATE INDEX "pos_payment_events_providerInvoiceId_idx" ON "pos_payment_events"("providerInvoiceId");

-- CreateIndex
CREATE INDEX "pos_payment_events_providerPaymentId_idx" ON "pos_payment_events"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_payment_events_deviceId_idempotencyKey_key" ON "pos_payment_events"("deviceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "pos_payment_events" ADD CONSTRAINT "pos_payment_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payment_events" ADD CONSTRAINT "pos_payment_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payment_events" ADD CONSTRAINT "pos_payment_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
