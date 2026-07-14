-- Universal Customer profile for the POS channel (docs/CUSTOMER_LOYALTY.md
-- §4/§7/§9/§13 step 1) — fully additive: telegramId becomes nullable (every
-- existing row already has a value, so nothing is rewritten), every new
-- column is nullable with no default write, every new FK is SetNull. No
-- backfill runs as part of this migration — see
-- packages/prisma/backfill-loyalty-cards.ts for loyaltyCardNumber.

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "loyaltyCardNumber" TEXT,
ADD COLUMN     "loyaltyCardQr" TEXT,
ALTER COLUMN "telegramId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "counterparties" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "sale_events" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_loyaltyCardNumber_key" ON "customers"("loyaltyCardNumber");

-- CreateIndex
CREATE INDEX "customers_tenantId_phone_idx" ON "customers"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "counterparties_customerId_key" ON "counterparties"("customerId");

-- CreateIndex
CREATE INDEX "sale_events_customerId_idx" ON "sale_events"("customerId");

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_events" ADD CONSTRAINT "sale_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
