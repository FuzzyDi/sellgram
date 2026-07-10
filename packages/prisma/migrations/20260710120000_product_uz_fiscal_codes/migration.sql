-- Uzbekistan fiscal/marking codes for products. Purely additive: two new
-- nullable columns on "products", no existing column altered or dropped,
-- no backfill — mxikCode/packageCode are NULL for every pre-existing row.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "mxikCode" TEXT,
ADD COLUMN     "packageCode" TEXT;
