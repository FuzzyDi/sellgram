// Seeds global PlatformPolicy rows (docs/POS_POLICY_ENGINE.md §13 step
// 1). Deliberately a SEPARATE script from seed.ts: that script resets and
// re-seeds one demo TENANT's data (products, orders, customers, etc.) —
// PlatformPolicy is explicitly not tenant-scoped (§3.1), so mixing it into
// a per-tenant reset/seed cycle would be conceptually wrong (this data
// should exist once, platform-wide, independent of whatever demo tenant
// churn seed.ts does). Safe to run repeatedly — upserts by scope+severity
// combination via a manual find-then-create/update rather than a Prisma
// `upsert`, since there's no natural unique key on PlatformPolicy to
// upsert against yet (id is a cuid the seed doesn't control).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// docs/POS_POLICY_ENGINE.md §3.1's worked example — Uzbekistan regulation
// prohibits cash payment for tobacco/alcohol. `match` uses Category.slug
// STRING VALUES (see the schema comment on PlatformPolicy.match for why:
// Category is tenant-scoped, so a global rule can't reference any one
// tenant's specific Category.id).
const PLATFORM_RULES = [
  {
    scope: 'PAYMENT' as const,
    severity: 'BLOCK' as const,
    match: { categorySlugs: ['tobacco', 'alcohol'] },
    extra: { denyPayments: ['CASH'] },
    message: {
      ru: 'Табак и алкоголь нельзя продавать за наличные',
      uz: "Tamaki va alkogolni naqd pulga sotib bo'lmaydi",
    },
  },
];

async function main() {
  for (const rule of PLATFORM_RULES) {
    const existing = await prisma.platformPolicy.findFirst({
      where: { scope: rule.scope, severity: rule.severity },
    });
    if (existing) {
      await prisma.platformPolicy.update({
        where: { id: existing.id },
        data: { match: rule.match, extra: rule.extra, message: rule.message, enabled: true },
      });
      console.log(`Updated platform policy: ${rule.scope}/${rule.severity} (${existing.id})`);
    } else {
      const created = await prisma.platformPolicy.create({ data: rule });
      console.log(`Created platform policy: ${rule.scope}/${rule.severity} (${created.id})`);
    }
  }

  // Bump the global version counter so any till that already cached
  // policiesVersion=0/absent picks up this seed on its next fetch, once
  // GET /pos/v1/settings actually reads from this table (§13 step 3 — not
  // implemented yet, this just keeps the counter meaningful from the
  // start rather than leaving it at its default forever).
  const versionRow = await prisma.platformPolicyVersion.findFirst();
  if (versionRow) {
    await prisma.platformPolicyVersion.update({
      where: { id: versionRow.id },
      data: { version: { increment: 1 } },
    });
  } else {
    await prisma.platformPolicyVersion.create({ data: { version: 1 } });
  }

  console.log('Platform policy seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Platform policy seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
