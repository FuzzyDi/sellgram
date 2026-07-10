-- Per-item VAT and UZ goods-marking classification for products. Purely
-- additive: four new columns on "products", two nullable with no
-- meaningful default (vatRate, markType) and two Boolean columns
-- defaulted to false so every existing row stays correct with no
-- backfill (vatRate NULL = "use the store's tax default", isMarked
-- false = "not a marked good").

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "vatRate" DECIMAL(5,2),
ADD COLUMN     "vatExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "markType" TEXT,
ADD COLUMN     "isMarked" BOOLEAN NOT NULL DEFAULT false;
