-- OrderItem.productId had an FK constraint but no index — Postgres does
-- not auto-index FK columns. analytics/routes.ts's "top products" query
-- and jobs/scheduled-reports.ts both filter order_items by productId IN
-- (...) on every dashboard load / scheduled report send.

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");
