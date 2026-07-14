-- Moves POS loyalty accrual's identity source from SaleEvent to
-- FiscalEvent (docs/CUSTOMER_LOYALTY.md §7 revision) — a receipt is only
-- "real" once fiscalized, which SaleEvent's own status field cannot
-- guarantee on its own. Fully additive: every new column is nullable,
-- no default write, the new FK is SetNull, no data backfilled.

-- AlterTable
ALTER TABLE "fiscal_events" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "loyalty_transactions" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- CreateIndex
CREATE INDEX "fiscal_events_customerId_idx" ON "fiscal_events"("customerId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_sourceType_sourceId_idx" ON "loyalty_transactions"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "fiscal_events" ADD CONSTRAINT "fiscal_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
