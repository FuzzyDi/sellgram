-- Revert 20260702144236_fix_order_product_cascade: keep order_items/purchase_order_items
-- -> products as ON DELETE RESTRICT (matches 20260316070746_init). CASCADE here would
-- silently wipe historical order/purchase-order line items if a product is ever hard-deleted.
-- The tenant-cascade-delete FK conflict this was originally worked around is instead fixed
-- at the call site: the nightly hard-delete job in app.ts now explicitly deletes
-- OrderItem/PurchaseOrderItem for the tenant before deleting the Tenant row.
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_productId_fkey";
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_productId_fkey";
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
