-- AlterTable
ALTER TABLE "products" ADD COLUMN "showInMiniapp" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "products_tenantId_isActive_showInMiniapp_idx" ON "products"("tenantId", "isActive", "showInMiniapp");
