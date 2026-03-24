-- Loyalty tiers and referral program

-- Add tiers and referral fields to loyalty_configs
ALTER TABLE loyalty_configs ADD COLUMN IF NOT EXISTS tiers          JSONB;
ALTER TABLE loyalty_configs ADD COLUMN IF NOT EXISTS referral_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE loyalty_configs ADD COLUMN IF NOT EXISTS referral_bonus   INTEGER NOT NULL DEFAULT 500;

-- Add referral fields to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS referred_by   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS customers_referral_code_key
  ON customers(referral_code)
  WHERE referral_code IS NOT NULL;
