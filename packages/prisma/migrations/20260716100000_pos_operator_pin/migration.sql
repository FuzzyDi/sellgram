-- PIN authentication for POS operators (docs/POS_POLICY_ENGINE.md §14.1)
-- — fully additive: pinRequired defaults false, pinHashSha256/pinSalt
-- are nullable with no backfill. Existing operators keep pinRequired =
-- false, exactly the "backward compat: operators without a PIN have
-- pinRequired=false" behavior the wire contract already assumes.

-- AlterTable
ALTER TABLE "pos_operators" ADD COLUMN     "pinHashSha256" TEXT,
ADD COLUMN     "pinRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinSalt" TEXT;
