-- POS Sync first wave (additive only): device identity, activation, catalog
-- snapshot, sync cursor, stock ledger. See docs/SBGCLOUD_ARCHITECTURE.md.
-- No existing tables are altered — sale/fiscal/shift events intentionally
-- NOT modeled here (pending a confirmed fiscal integration partner for
-- Uzbekistan).

-- CreateEnum
CREATE TYPE "PosDeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DeviceActivationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StockLedgerReason" AS ENUM ('POS_SALE', 'POS_ADJUSTMENT', 'RESTOCK', 'OTHER');

-- CreateTable
CREATE TABLE "pos_devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "status" "PosDeviceStatus" NOT NULL DEFAULT 'PENDING',
    "apiKeyHash" TEXT,
    "apiKeyPrefix" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_activations" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "activationCode" TEXT NOT NULL,
    "status" "DeviceActivationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_cursors" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "lastCatalogVersion" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" "StockLedgerReason" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_apiKeyHash_key" ON "pos_devices"("apiKeyHash");

-- CreateIndex
CREATE INDEX "pos_devices_tenantId_storeId_idx" ON "pos_devices"("tenantId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "device_activations_activationCode_key" ON "device_activations"("activationCode");

-- CreateIndex
CREATE INDEX "device_activations_deviceId_idx" ON "device_activations"("deviceId");

-- CreateIndex
CREATE INDEX "catalog_snapshots_tenantId_storeId_version_idx" ON "catalog_snapshots"("tenantId", "storeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "sync_cursors_deviceId_key" ON "sync_cursors"("deviceId");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_tenantId_productId_createdAt_idx" ON "stock_ledger_entries"("tenantId", "productId", "createdAt");

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_snapshots" ADD CONSTRAINT "catalog_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_snapshots" ADD CONSTRAINT "catalog_snapshots_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "pos_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
