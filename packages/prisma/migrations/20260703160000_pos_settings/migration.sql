-- PosSettings: store-scoped POS operational settings backing
-- GET /pos/v1/settings (docs/POS_SYNC_API.md §10). One row per store,
-- version bumped on every store-admin write.

-- CreateTable
CREATE TABLE "pos_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_settings_storeId_key" ON "pos_settings"("storeId");

-- CreateIndex
CREATE INDEX "pos_settings_tenantId_idx" ON "pos_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "pos_settings" ADD CONSTRAINT "pos_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_settings" ADD CONSTRAINT "pos_settings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
