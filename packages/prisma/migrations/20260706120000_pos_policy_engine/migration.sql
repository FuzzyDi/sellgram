-- POS Policy Engine (docs/POS_POLICY_ENGINE.md §13 step 1). Purely
-- additive: two new tables, two new enums, and new nullable/defaulted
-- columns on the existing "pos_settings" table. No existing column is
-- altered or dropped, no existing data is touched.

-- CreateEnum
CREATE TYPE "PolicyScope" AS ENUM ('SALE', 'REFUND', 'SHIFT', 'PAYMENT', 'MARKING', 'DISCOUNT', 'CASHIER', 'PRINT');

-- CreateEnum
CREATE TYPE "PolicySeverity" AS ENUM ('BLOCK', 'WARN', 'REQUIRE_MANAGER', 'REQUIRE_ACTION', 'INFO');

-- AlterTable
-- version/payload are untouched — these four are new, defaulted columns
-- only (docs/POS_POLICY_ENGINE.md §3.2).
ALTER TABLE "pos_settings" ADD COLUMN     "policiesVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "printTemplates" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "printTemplatesVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tenantPolicyRules" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
-- Deliberately NOT tenant-scoped — no tenantId column at all (§3.1).
CREATE TABLE "platform_policies" (
    "id" TEXT NOT NULL,
    "scope" "PolicyScope" NOT NULL,
    "severity" "PolicySeverity" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "match" JSONB NOT NULL,
    "message" JSONB NOT NULL,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Singleton by application convention, not a DB constraint — see the
-- schema comment on this model.
CREATE TABLE "platform_policy_version" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "platform_policy_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_policies_scope_idx" ON "platform_policies"("scope");
