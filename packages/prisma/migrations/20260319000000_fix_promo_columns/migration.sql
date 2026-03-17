-- Fix: ensure all tables/columns from migrations 20260317-20260318 that were
-- marked applied but never executed are present. All statements are idempotent.

-- From 20260317100000_add_customer_language_code
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "languageCode" TEXT;

-- From 20260317000000_add_order_reviews
CREATE TABLE IF NOT EXISTS "order_reviews" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "order_reviews_orderId_key" ON "order_reviews"("orderId");
CREATE INDEX IF NOT EXISTS "order_reviews_tenantId_idx" ON "order_reviews"("tenantId");
CREATE INDEX IF NOT EXISTS "order_reviews_customerId_idx" ON "order_reviews"("customerId");
DO $$ BEGIN
  BEGIN
    ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- From 20260318000000_add_wishlist_promocodes

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
