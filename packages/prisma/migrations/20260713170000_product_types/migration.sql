-- Product type system (docs/PRODUCT_TYPES.md) — global, not tenant-scoped
-- ProductType table plus one nullable, additive FK column on "products".
-- No backfill: existing products get productTypeId = NULL, behaving
-- exactly as before this migration.

-- CreateEnum
CREATE TYPE "WeightMode" AS ENUM ('PIECE', 'WEIGHT', 'PIECE_WEIGHT');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "productTypeId" TEXT;

-- CreateTable
CREATE TABLE "product_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentTypeId" TEXT,
    "weightMode" "WeightMode" NOT NULL DEFAULT 'PIECE',
    "barcodePrefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "markType" TEXT,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_types_code_key" ON "product_types"("code");

-- CreateIndex
CREATE INDEX "product_types_parentTypeId_idx" ON "product_types"("parentTypeId");

-- CreateIndex
CREATE INDEX "product_types_enabled_idx" ON "product_types"("enabled");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "product_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_types" ADD CONSTRAINT "product_types_parentTypeId_fkey" FOREIGN KEY ("parentTypeId") REFERENCES "product_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
