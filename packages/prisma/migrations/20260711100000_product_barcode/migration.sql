-- ProductBarcode — new table for per-product/per-variant scannable
-- codes (EAN13/EAN8/CODE128/DATAMATRIX/QR). Purely additive: one new
-- table, no existing column or data touched.

-- CreateTable
CREATE TABLE "product_barcodes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "barcode" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EAN13',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "unitQty" DECIMAL(10,3),

    CONSTRAINT "product_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_barcodes_tenantId_barcode_key" ON "product_barcodes"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "product_barcodes_tenantId_productId_idx" ON "product_barcodes"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "product_barcodes_tenantId_variantId_idx" ON "product_barcodes"("tenantId", "variantId");

-- AddForeignKey
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Nullable, no historical data to protect — SET NULL (deleting the
-- variant just makes this a product-level barcode instead of removing
-- the row).
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
