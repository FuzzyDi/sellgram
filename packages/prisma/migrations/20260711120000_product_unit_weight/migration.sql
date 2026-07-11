-- Unit of measure + weighted-goods support for products. Purely
-- additive: five new columns on "products", all nullable or defaulted,
-- no backfill — unit/pluCode/pricePerKg are NULL and
-- isByWeight/isWeightedPiece are false for every pre-existing row.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "unit" TEXT,
ADD COLUMN     "isByWeight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isWeightedPiece" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pluCode" TEXT,
ADD COLUMN     "pricePerKg" DECIMAL(12,2);
