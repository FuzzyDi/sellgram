CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "delta" INTEGER NOT NULL,
  "qtyBefore" INTEGER NOT NULL,
  "qtyAfter" INTEGER NOT NULL,
  "note" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stock_movements_tenantId_productId_idx" ON "stock_movements"("tenantId", "productId");
CREATE INDEX IF NOT EXISTS "stock_movements_tenantId_createdAt_idx" ON "stock_movements"("tenantId", "createdAt" DESC);

DO $$ BEGIN
  BEGIN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
