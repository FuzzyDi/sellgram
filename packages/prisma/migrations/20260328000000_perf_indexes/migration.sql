-- Replace single-column customerId index with composite (customerId, createdAt DESC)
-- for faster customer loyalty history queries
DROP INDEX IF EXISTS "loyalty_transactions_customerId_idx";
CREATE INDEX "loyalty_transactions_customerId_createdAt_idx" ON "loyalty_transactions"("customerId", "createdAt" DESC);

-- Add status index on broadcast_campaigns for queue processing
CREATE INDEX IF NOT EXISTS "broadcast_campaigns_status_idx" ON "broadcast_campaigns"("status");

-- Add paymentStatus index on orders for paymentStatus filter queries
CREATE INDEX IF NOT EXISTS "orders_tenantId_paymentStatus_idx" ON "orders"("tenantId", "paymentStatus");
