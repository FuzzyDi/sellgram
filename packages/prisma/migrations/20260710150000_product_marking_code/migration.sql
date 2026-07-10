-- ProductMarkingCode — scaffold only (no routes/service logic/UI yet).
-- Purely additive: one new table, one new enum. No existing column or
-- data is touched.

-- CreateEnum
CREATE TYPE "MarkingCodeStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'VOIDED');

-- CreateTable
CREATE TABLE "product_marking_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "markType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "MarkingCodeStatus" NOT NULL DEFAULT 'IN_STOCK',
    "purchaseOrderId" TEXT,
    "saleEventId" TEXT,
    "orderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_marking_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_marking_codes_tenantId_code_key" ON "product_marking_codes"("tenantId", "code");

-- CreateIndex
CREATE INDEX "product_marking_codes_tenantId_productId_status_idx" ON "product_marking_codes"("tenantId", "productId", "status");

-- AddForeignKey
ALTER TABLE "product_marking_codes" ADD CONSTRAINT "product_marking_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_marking_codes" ADD CONSTRAINT "product_marking_codes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Nullable, no historical data to protect — SET NULL (a manually-entered
-- code, or one whose PurchaseOrder was later deleted, just loses its
-- provenance link, not the row itself).
ALTER TABLE "product_marking_codes" ADD CONSTRAINT "product_marking_codes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
