-- POS Policy Engine (docs/POS_POLICY_ENGINE.md §13 step 2). Purely
-- additive: three new nullable/defaulted columns on each of
-- "sale_events" and "fiscal_events". No existing column is altered or
-- dropped, no existing row is backfilled — policiesVersion/managerOverride
-- are NULL and triggeredRuleIds is an empty array for every pre-existing
-- row.

-- AlterTable
ALTER TABLE "sale_events" ADD COLUMN     "managerOverride" JSONB,
ADD COLUMN     "policiesVersion" INTEGER,
ADD COLUMN     "triggeredRuleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "fiscal_events" ADD COLUMN     "managerOverride" JSONB,
ADD COLUMN     "policiesVersion" INTEGER,
ADD COLUMN     "triggeredRuleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
