CREATE TABLE IF NOT EXISTS "customer_addresses" (
  "id"         TEXT         NOT NULL,
  "customerId" TEXT         NOT NULL,
  "tenantId"   TEXT         NOT NULL,
  "label"      TEXT         NOT NULL DEFAULT 'home',
  "address"    TEXT         NOT NULL,
  "isDefault"  BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_addresses_customerId_idx" ON "customer_addresses"("customerId");

DO $$ BEGIN
  ALTER TABLE "customer_addresses"
    ADD CONSTRAINT "customer_addresses_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
