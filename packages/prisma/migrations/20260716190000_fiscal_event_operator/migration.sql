-- FiscalEvent gains operatorId/operatorName/operatorRole
-- (docs/POS_POLICY_ENGINE.md §14.1) — which cashier rang up a receipt.
-- operatorName/operatorRole are a point-in-time snapshot, not kept in
-- sync with PosOperator; operatorId is a nullable FK, SET NULL on
-- operator deletion so historical receipts are never deleted or
-- corrupted by a cashier being removed. Fully additive: three new
-- nullable columns and one new index/FK, no existing column touched.

-- AlterTable
ALTER TABLE "fiscal_events" ADD COLUMN     "operatorId" TEXT,
ADD COLUMN     "operatorName" TEXT,
ADD COLUMN     "operatorRole" TEXT;

-- CreateIndex
CREATE INDEX "fiscal_events_operatorId_idx" ON "fiscal_events"("operatorId");

-- AddForeignKey
ALTER TABLE "fiscal_events" ADD CONSTRAINT "fiscal_events_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "pos_operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
