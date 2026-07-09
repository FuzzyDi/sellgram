-- POS staff/operators support (docs/POS_POLICY_ENGINE.md §14). Purely
-- additive: one new enum, one new table, one new defaulted column on the
-- existing "pos_settings" table. No existing column is altered or
-- dropped, no existing data is touched.

-- CreateEnum
CREATE TYPE "PosOperatorRole" AS ENUM ('CASHIER', 'SENIOR_CASHIER', 'ADMIN');

-- AlterTable
ALTER TABLE "pos_settings" ADD COLUMN     "staffVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "pos_operators" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "PosOperatorRole" NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_operators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_operators_tenantId_storeId_idx" ON "pos_operators"("tenantId", "storeId");

-- AddForeignKey
ALTER TABLE "pos_operators" ADD CONSTRAINT "pos_operators_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_operators" ADD CONSTRAINT "pos_operators_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
