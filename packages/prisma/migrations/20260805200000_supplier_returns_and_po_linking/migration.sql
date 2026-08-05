-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "StockLedgerReason" ADD VALUE 'SUPPLIER_RETURN';

-- AlterEnum
ALTER TYPE "SupplierLedgerType" ADD VALUE 'RETURN';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "relatesToId" TEXT;

-- AlterTable
ALTER TABLE "supplier_ledger" ADD COLUMN     "supplierReturnId" TEXT;

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "returnNumber" INTEGER NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxRate" DECIMAL(12,6),
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "purchaseOrderId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_items" (
    "id" TEXT NOT NULL,
    "supplierReturnId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "supplier_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_returns_tenantId_idx" ON "supplier_returns"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_tenantId_returnNumber_key" ON "supplier_returns"("tenantId", "returnNumber");

-- CreateIndex
CREATE INDEX "supplier_return_items_supplierReturnId_idx" ON "supplier_return_items"("supplierReturnId");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_relatesToId_fkey" FOREIGN KEY ("relatesToId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "supplier_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "supplier_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
