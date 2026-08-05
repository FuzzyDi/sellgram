-- CreateEnum
CREATE TYPE "ConsignmentSettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "POPaymentMethod" ADD VALUE 'CONSIGNMENT';

-- AlterTable
ALTER TABLE "supplier_ledger" ADD COLUMN     "consignmentSettlementId" TEXT;

-- CreateTable
CREATE TABLE "consignment_settlements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settlementNumber" INTEGER NOT NULL,
    "status" "ConsignmentSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "purchaseOrderId" TEXT NOT NULL,
    "totalDebtCharged" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consignment_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consignment_settlement_items" (
    "id" TEXT NOT NULL,
    "consignmentSettlementId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "qtySold" INTEGER NOT NULL DEFAULT 0,
    "debtCharged" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "consignment_settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consignment_settlements_tenantId_idx" ON "consignment_settlements"("tenantId");

-- CreateIndex
CREATE INDEX "consignment_settlements_purchaseOrderId_idx" ON "consignment_settlements"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "consignment_settlements_tenantId_settlementNumber_key" ON "consignment_settlements"("tenantId", "settlementNumber");

-- CreateIndex
CREATE INDEX "consignment_settlement_items_consignmentSettlementId_idx" ON "consignment_settlement_items"("consignmentSettlementId");

-- AddForeignKey
ALTER TABLE "consignment_settlements" ADD CONSTRAINT "consignment_settlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignment_settlements" ADD CONSTRAINT "consignment_settlements_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignment_settlement_items" ADD CONSTRAINT "consignment_settlement_items_consignmentSettlementId_fkey" FOREIGN KEY ("consignmentSettlementId") REFERENCES "consignment_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignment_settlement_items" ADD CONSTRAINT "consignment_settlement_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_consignmentSettlementId_fkey" FOREIGN KEY ("consignmentSettlementId") REFERENCES "consignment_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
