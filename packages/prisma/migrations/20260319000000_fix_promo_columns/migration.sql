-- Fix: ensure promo_codes and wishlist_items tables exist and orders has promo columns.
-- These statements are idempotent (IF NOT EXISTS / DO-EXCEPTION) so safe to re-run.

CREATE TABLE IF NOT EXISTS "wishlist_items" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "promo_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(12,2) NOT NULL,
    "minOrderAmount" DECIMAL(12,2),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "wishlist_items_customerId_idx" ON "wishlist_items"("customerId");
CREATE UNIQUE INDEX IF NOT EXISTS "wishlist_items_customerId_productId_key" ON "wishlist_items"("customerId", "productId");
CREATE INDEX IF NOT EXISTS "promo_codes_tenantId_idx" ON "promo_codes"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "promo_codes_tenantId_code_key" ON "promo_codes"("tenantId", "code");

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promoDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promoCodeId" TEXT;

DO $$ BEGIN
  BEGIN
    ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_promoCodeId_fkey"
      FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
