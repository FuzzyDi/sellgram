-- CreateEnum
CREATE TYPE "PriceRevisionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "posPrice" DECIMAL(12,2),
ADD COLUMN     "wholesalePrice" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "price_revisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "PriceRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_revision_items" (
    "id" TEXT NOT NULL,
    "priceRevisionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "oldPrice" DECIMAL(12,2) NOT NULL,
    "newPrice" DECIMAL(12,2),
    "oldPosPrice" DECIMAL(12,2) NOT NULL,
    "newPosPrice" DECIMAL(12,2),
    "oldWholesalePrice" DECIMAL(12,2) NOT NULL,
    "newWholesalePrice" DECIMAL(12,2),

    CONSTRAINT "price_revision_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_revisions_tenantId_idx" ON "price_revisions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "price_revisions_tenantId_revisionNumber_key" ON "price_revisions"("tenantId", "revisionNumber");

-- CreateIndex
CREATE INDEX "price_revision_items_priceRevisionId_idx" ON "price_revision_items"("priceRevisionId");

-- AddForeignKey
ALTER TABLE "price_revisions" ADD CONSTRAINT "price_revisions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_revision_items" ADD CONSTRAINT "price_revision_items_priceRevisionId_fkey" FOREIGN KEY ("priceRevisionId") REFERENCES "price_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_revision_items" ADD CONSTRAINT "price_revision_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
