import { randomInt } from 'node:crypto';

// docs/CUSTOMER_LOYALTY.md §5/§8/§13 step 1 — "LC" + 6 digits, e.g.
// "LC384021". Distinct format from Customer.referralCode (8-char hex,
// apps/api/src/modules/bot/shop-api.ts) on purpose, so the two are
// visibly different identifiers in support conversations even though
// there is no technical collision risk between them (different columns).
// Globally unique (Customer.loyaltyCardNumber @unique), same
// not-tenant-scoped precedent as referralCode already uses.
function randomCardNumber(): string {
  return `LC${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

// Shared by every place a loyaltyCardNumber can come into existence:
// POST /pos/v1/customer, POST /customers (admin), the bot's lazy
// generation on first card view, and the one-off backfill script — one
// implementation, not four copies of the same retry loop. `client` is
// typed loosely (matches the existing `tx: any` convention in
// pos-sync/routes.ts's applyStockDelta) so this works both as a bare
// `prisma` call and inside a `$transaction` callback.
export async function generateLoyaltyCardNumber(client: any): Promise<string> {
  // 1,000,000 possible values — a handful of retries on the rare
  // @unique collision is enough; this mirrors the retry-on-P2002 pattern
  // already used for idempotencyKey races elsewhere in pos-sync/routes.ts,
  // not a new error-handling shape.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomCardNumber();
    const existing = await client.customer.findUnique({
      where: { loyaltyCardNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Failed to generate a unique loyaltyCardNumber after 5 attempts');
}
