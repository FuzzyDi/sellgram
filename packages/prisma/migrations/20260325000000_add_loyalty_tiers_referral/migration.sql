-- Loyalty tiers and referral program

-- Add tiers and referral fields to loyalty_configs
ALTER TABLE loyalty_configs ADD COLUMN IF NOT EXISTS tiers            JSONB;
ALTER TABLE loyalty_configs ADD COLUMN IF NOT EXISTS "referralEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE loyalty_configs ADD COLUMN IF NOT EXISTS "referralBonus"   INTEGER NOT NULL DEFAULT 500;

-- Add referral fields to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "referredBy"   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "customers_referralCode_key"
  ON customers("referralCode")
  WHERE "referralCode" IS NOT NULL;
