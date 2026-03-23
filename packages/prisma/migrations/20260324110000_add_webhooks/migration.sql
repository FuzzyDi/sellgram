CREATE TABLE IF NOT EXISTS "webhooks" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "url"       TEXT         NOT NULL,
  "events"    JSONB        NOT NULL DEFAULT '[]',
  "secret"    TEXT         NOT NULL,
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhooks_tenantId_idx" ON "webhooks"("tenantId");

DO $$ BEGIN
  ALTER TABLE "webhooks"
    ADD CONSTRAINT "webhooks_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
