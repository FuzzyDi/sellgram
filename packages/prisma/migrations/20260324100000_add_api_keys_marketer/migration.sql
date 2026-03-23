-- Add MARKETER value to UserRole enum
DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'MARKETER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create api_keys table
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id"         TEXT         NOT NULL,
  "tenantId"   TEXT         NOT NULL,
  "name"       TEXT         NOT NULL,
  "keyHash"    TEXT         NOT NULL,
  "prefix"     TEXT         NOT NULL,
  "isActive"   BOOLEAN      NOT NULL DEFAULT true,
  "expiresAt"  TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX IF NOT EXISTS "api_keys_tenantId_idx" ON "api_keys"("tenantId");

DO $$ BEGIN
  ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
