-- B2B / Counterparties — new models (docs/B2B_COUNTERPARTIES.md §13 step
-- 2). Purely additive: three new tables, three new enums, and additive
-- columns on "orders"/"tenants". No existing column is altered or
-- dropped, no existing data is touched.

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('TELEGRAM', 'B2B');

-- CreateEnum
CREATE TYPE "CounterpartyType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "CounterpartyLedgerType" AS ENUM ('ORDER_CHARGE', 'PAYMENT_RECEIVED', 'ADJUSTMENT');

-- AlterTable
-- salesChannel defaults to TELEGRAM, so every existing order row stays
-- correct with no backfill. counterpartyId is the B2B counterpart to
-- customerId, added in the previous migration.
ALTER TABLE "orders" ADD COLUMN     "counterpartyId" TEXT,
ADD COLUMN     "salesChannel" "SalesChannel" NOT NULL DEFAULT 'TELEGRAM';

-- AlterTable
-- Plain tenant-level toggle — not plan-gated (docs/B2B_COUNTERPARTIES.md §9).
ALTER TABLE "tenants" ADD COLUMN     "b2bEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "counterparties" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "CounterpartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supplierId" TEXT,
    "currentDebt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparty_prices" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparty_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparty_ledger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "type" "CounterpartyLedgerType" NOT NULL,
    "delta" DECIMAL(12,2) NOT NULL,
    "orderId" TEXT,
    "originalDueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counterparty_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counterparties_supplierId_key" ON "counterparties"("supplierId");

-- CreateIndex
CREATE INDEX "counterparties_tenantId_idx" ON "counterparties"("tenantId");

-- Uniqueness for CounterpartyPrice (docs/B2B_COUNTERPARTIES.md §5.2/§12.3):
-- deliberately NOT a single `UNIQUE (counterpartyId, productId, variantId)`.
-- Postgres does not treat NULL = NULL as equal in a unique index, so a
-- plain three-column unique index would silently allow duplicate rows for
-- every non-variant product (variantId IS NULL) — exactly the common case,
-- since most products have no variants. Two partial unique indexes cover
-- the NULL and NOT NULL cases separately, so both are actually enforced:
-- CreateIndex
CREATE UNIQUE INDEX "counterparty_prices_no_variant_key" ON "counterparty_prices" ("counterpartyId", "productId") WHERE "variantId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_prices_with_variant_key" ON "counterparty_prices" ("counterpartyId", "productId", "variantId") WHERE "variantId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "counterparty_ledger_tenantId_counterpartyId_createdAt_idx" ON "counterparty_ledger"("tenantId", "counterpartyId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_tenantId_counterpartyId_idx" ON "orders"("tenantId", "counterpartyId");

-- AddForeignKey
-- Brand-new, optional relation with no historical data to protect — SET
-- NULL (Prisma's default for an optional relation) is fine here, unlike
-- the deliberate RESTRICT override on Order.customerId in the previous
-- migration (that one guards pre-existing order history).
ALTER TABLE "orders" ADD CONSTRAINT "orders_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_prices" ADD CONSTRAINT "counterparty_prices_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_prices" ADD CONSTRAINT "counterparty_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_prices" ADD CONSTRAINT "counterparty_prices_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_ledger" ADD CONSTRAINT "counterparty_ledger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_ledger" ADD CONSTRAINT "counterparty_ledger_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_ledger" ADD CONSTRAINT "counterparty_ledger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
