-- Order.customerId becomes optional (docs/B2B_COUNTERPARTIES.md §13 step 1):
-- a future B2B order will have a Counterparty instead of a Customer. Every
-- existing row already has a non-null customerId, so no backfill is
-- needed — this only relaxes the constraint going forward.
--
-- The FK's ON DELETE action stays RESTRICT (explicit in schema.prisma via
-- onDelete: Restrict — Prisma's default for a newly-optional relation
-- would otherwise be SET NULL). Same reasoning as OrderItem.product's
-- existing RESTRICT: order history integrity matters more than convenience
-- deleting a Customer — a Customer with existing (Telegram) orders must
-- stay undeletable, even though the column itself can now hold NULL for
-- future B2B orders that never reference a Customer at all.

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "customerId" DROP NOT NULL;
