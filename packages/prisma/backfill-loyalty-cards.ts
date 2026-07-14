// Backfills Customer.loyaltyCardNumber for existing rows that predate it
// (docs/CUSTOMER_LOYALTY.md §11/§13 step 1). Not required for the feature
// to work — a customer with loyaltyCardNumber = NULL simply isn't
// POS-identifiable by card yet, same "unassigned behaves as today"
// framing docs/PRODUCT_TYPES.md §9 already used for Product.productTypeId
// — so this can run asynchronously after the migration, not as part of it.
//
// Self-contained generation logic (same "LC" + 6-digit shape as
// apps/api/src/lib/loyalty-card.ts's generateLoyaltyCardNumber) rather than
// importing that module — packages/prisma is a separate workspace package
// from apps/api, same reasoning seed-product-types.ts already follows for
// staying dependency-free of the API app.
//
// Idempotent: only ever selects rows with loyaltyCardNumber IS NULL, so a
// second run touches zero rows the first run already filled in.
//
// Run: npx tsx packages/prisma/backfill-loyalty-cards.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function randomCardNumber(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return `LC${String(n).padStart(6, '0')}`;
}

async function generateUniqueCardNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomCardNumber();
    const existing = await prisma.customer.findUnique({
      where: { loyaltyCardNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Failed to generate a unique loyaltyCardNumber after 5 attempts');
}

async function main() {
  const customers = await prisma.customer.findMany({
    where: { loyaltyCardNumber: null },
    select: { id: true },
  });

  console.log(`Found ${customers.length} customer(s) with no loyaltyCardNumber.`);

  let updated = 0;
  for (const customer of customers) {
    const cardNumber = await generateUniqueCardNumber();
    await prisma.customer.update({
      where: { id: customer.id },
      data: { loyaltyCardNumber: cardNumber, loyaltyCardQr: cardNumber },
    });
    updated += 1;
    if (updated % 100 === 0) console.log(`  ...${updated}/${customers.length}`);
  }

  console.log(`Backfill completed: ${updated} customer(s) updated.`);
}

main()
  .catch((e) => {
    console.error('Loyalty card backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
