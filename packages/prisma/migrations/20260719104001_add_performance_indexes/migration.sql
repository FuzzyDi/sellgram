-- CreateIndex
CREATE INDEX "products_tenantId_deletedAt_idx" ON "products"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "products_tenantId_updatedAt_idx" ON "products"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "fiscal_events_tenantId_createdAt_idx" ON "fiscal_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "pos_payment_events_tenantId_createdAt_idx" ON "pos_payment_events"("tenantId", "createdAt");
