-- Order items and purchase order items must not block deleting their product
-- (e.g. cascading tenant deletion in tests, or future hard-delete tooling).
-- Was ON DELETE RESTRICT, which is inconsistent with every other Product
-- relation (ProductImage/ProductVariant/StockMovement/WishlistItem all cascade).
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_productId_fkey";
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_productId_fkey";
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
