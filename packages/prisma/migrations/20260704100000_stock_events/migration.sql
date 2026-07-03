-- StockEvent: non-sale stock movements reported by a till (stock-count
-- correction, manual restock), ingested idempotently (docs/POS_SYNC_API.md
-- §14). productId has no FK on purpose — an event referencing a product
-- unknown to Cloud is stored with a warning instead of being rejected.

-- CreateTable
CREATE TABLE "stock_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" "StockLedgerReason" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_events_idempotencyKey_key" ON "stock_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "stock_events_tenantId_storeId_productId_idx" ON "stock_events"("tenantId", "storeId", "productId");

-- AddForeignKey
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
