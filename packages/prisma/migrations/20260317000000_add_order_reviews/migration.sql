-- CreateTable
CREATE TABLE "order_reviews" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_reviews_orderId_key" ON "order_reviews"("orderId");

-- CreateIndex
CREATE INDEX "order_reviews_tenantId_idx" ON "order_reviews"("tenantId");

-- CreateIndex
CREATE INDEX "order_reviews_customerId_idx" ON "order_reviews"("customerId");

-- AddForeignKey
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
