-- CreateEnum
CREATE TYPE "POPaymentMethod" AS ENUM ('CASH', 'NON_CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "SupplierLedgerType" AS ENUM ('PURCHASE_CHARGE', 'PAYMENT_MADE', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "paymentMethod" "POPaymentMethod" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "currentDebt" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "supplier_ledger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "type" "SupplierLedgerType" NOT NULL,
    "delta" DECIMAL(12,2) NOT NULL,
    "purchaseOrderId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_ledger_tenantId_supplierId_createdAt_idx" ON "supplier_ledger"("tenantId", "supplierId", "createdAt");

-- AddForeignKey
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
