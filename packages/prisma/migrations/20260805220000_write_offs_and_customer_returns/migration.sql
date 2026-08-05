-- CreateEnum
CREATE TYPE "WriteOffStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WriteOffReason" AS ENUM ('DEFECT', 'DAMAGE', 'SHORTAGE', 'INTERNAL_USE', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerReturnStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "CounterpartyLedgerType" ADD VALUE 'RETURN';

-- AlterEnum
ALTER TYPE "StockLedgerReason" ADD VALUE 'WRITE_OFF';
ALTER TYPE "StockLedgerReason" ADD VALUE 'CUSTOMER_RETURN';

-- AlterTable
ALTER TABLE "counterparty_ledger" ADD COLUMN     "customerReturnId" TEXT;

-- CreateTable
CREATE TABLE "stock_write_offs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "writeOffNumber" INTEGER NOT NULL,
    "status" "WriteOffStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" "WriteOffReason" NOT NULL DEFAULT 'OTHER',
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "purchaseOrderId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_write_off_items" (
    "id" TEXT NOT NULL,
    "stockWriteOffId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "stock_write_off_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_returns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "returnNumber" INTEGER NOT NULL,
    "status" "CustomerReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "counterpartyId" TEXT,
    "orderId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_return_items" (
    "id" TEXT NOT NULL,
    "customerReturnId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "customer_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_write_offs_tenantId_idx" ON "stock_write_offs"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_write_offs_tenantId_writeOffNumber_key" ON "stock_write_offs"("tenantId", "writeOffNumber");

-- CreateIndex
CREATE INDEX "stock_write_off_items_stockWriteOffId_idx" ON "stock_write_off_items"("stockWriteOffId");

-- CreateIndex
CREATE INDEX "customer_returns_tenantId_idx" ON "customer_returns"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_returns_tenantId_returnNumber_key" ON "customer_returns"("tenantId", "returnNumber");

-- CreateIndex
CREATE INDEX "customer_return_items_customerReturnId_idx" ON "customer_return_items"("customerReturnId");

-- AddForeignKey
ALTER TABLE "stock_write_offs" ADD CONSTRAINT "stock_write_offs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_write_offs" ADD CONSTRAINT "stock_write_offs_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_write_off_items" ADD CONSTRAINT "stock_write_off_items_stockWriteOffId_fkey" FOREIGN KEY ("stockWriteOffId") REFERENCES "stock_write_offs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_write_off_items" ADD CONSTRAINT "stock_write_off_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_return_items" ADD CONSTRAINT "customer_return_items_customerReturnId_fkey" FOREIGN KEY ("customerReturnId") REFERENCES "customer_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_return_items" ADD CONSTRAINT "customer_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_ledger" ADD CONSTRAINT "counterparty_ledger_customerReturnId_fkey" FOREIGN KEY ("customerReturnId") REFERENCES "customer_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
