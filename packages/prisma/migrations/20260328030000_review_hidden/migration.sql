ALTER TABLE "order_reviews" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "order_reviews_hidden_idx" ON "order_reviews"("tenantId", "hidden");
