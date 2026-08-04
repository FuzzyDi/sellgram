-- CartItem was the one tenant-owned model with no tenantId column and no
-- FK relations for storeId/productId/variantId — every other model in
-- this schema carries tenantId directly even when derivable through a
-- parent, for defense-in-depth. Not exploitable today (cart.service.ts/
-- checkout.service.ts always scope by customerId, which transitively
-- carries tenant), but nothing at the schema level enforced that.

-- AddColumn (nullable first — backfilled below, then locked to NOT NULL)
ALTER TABLE "cart_items" ADD COLUMN "tenantId" TEXT;

-- Backfill from the owning customer's tenant.
UPDATE "cart_items" ci
SET "tenantId" = c."tenantId"
FROM "customers" c
WHERE c.id = ci."customerId";

ALTER TABLE "cart_items" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "cart_items_tenantId_idx" ON "cart_items"("tenantId");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
