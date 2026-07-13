// Seeds the seven system ProductType rows (docs/PRODUCT_TYPES.md §7).
// Deliberately a SEPARATE script from seed.ts, same reasoning as
// seed-platform-policies.ts: ProductType is global, not tenant-scoped
// (§2), so it doesn't belong in a per-tenant demo-data reset cycle.
// Idempotent via `upsert` keyed on `code` (@unique) — unlike
// seed-platform-policies.ts's PlatformPolicy (no natural unique key at
// the time it was written), ProductType.code is unique from its first
// migration, so a real Prisma `upsert` applies directly instead of a
// manual find-then-create/update.
//
// Run: npx tsx packages/prisma/seed-product-types.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Final rules[] values agreed with the Android team (docs/PRODUCT_TYPES.md
// §4/§7) — ruleId/severity/channels/params, not the earlier flat-object
// shape.
const AGE_CONFIRMATION = { ruleId: 'AGE_CONFIRMATION', severity: 'BLOCK', channels: ['POS', 'TELEGRAM'], params: { minAge: 18 } };
const NO_CASH_PAYMENT = { ruleId: 'NO_CASH_PAYMENT', severity: 'BLOCK', channels: ['POS'] };
const MARKING_REQUIRED = { ruleId: 'MARKING_REQUIRED', severity: 'BLOCK', channels: ['POS', 'TELEGRAM'] };
const WEIGHT_REQUIRED = { ruleId: 'WEIGHT_REQUIRED', severity: 'BLOCK', channels: ['POS'] };

// Seeded in dependency order — BEER's parentTypeId is resolved from
// ALCOHOL's row after ALCOHOL is upserted (below), so ALCOHOL must run
// first. `parentCode` here is this script's own bookkeeping, not a
// column — resolved to a real parentTypeId at upsert time.
const SYSTEM_TYPES: {
  code: string;
  name: string;
  parentCode?: string;
  weightMode: 'PIECE' | 'WEIGHT' | 'PIECE_WEIGHT';
  barcodePrefixes?: string[];
  markType?: string;
  rules: unknown[];
  sortOrder: number;
}[] = [
  { code: 'STANDARD', name: 'Стандартный', weightMode: 'PIECE', rules: [], sortOrder: 0 },
  { code: 'ALCOHOL', name: 'Алкоголь', weightMode: 'PIECE', markType: 'ALCOHOL', rules: [AGE_CONFIRMATION, NO_CASH_PAYMENT, MARKING_REQUIRED], sortOrder: 1 },
  { code: 'TOBACCO', name: 'Табак', weightMode: 'PIECE', markType: 'TOBACCO', rules: [AGE_CONFIRMATION, NO_CASH_PAYMENT, MARKING_REQUIRED], sortOrder: 2 },
  { code: 'BEER', name: 'Пиво', parentCode: 'ALCOHOL', weightMode: 'PIECE', markType: 'BEER', rules: [], sortOrder: 3 },
  { code: 'WEIGHT', name: 'Весовой', weightMode: 'WEIGHT', barcodePrefixes: ['22'], rules: [WEIGHT_REQUIRED], sortOrder: 4 },
  { code: 'PIECE_WEIGHT', name: 'Штучно-весовой', weightMode: 'PIECE_WEIGHT', barcodePrefixes: ['23'], rules: [WEIGHT_REQUIRED], sortOrder: 5 },
  { code: 'DRUGS', name: 'Лекарства', weightMode: 'PIECE', markType: 'DRUGS', rules: [MARKING_REQUIRED], sortOrder: 6 },
];

async function main() {
  const idByCode = new Map<string, string>();

  for (const type of SYSTEM_TYPES) {
    const parentTypeId = type.parentCode ? idByCode.get(type.parentCode) : undefined;
    if (type.parentCode && !parentTypeId) {
      throw new Error(`Seed order error: ${type.code} needs ${type.parentCode} to be seeded first`);
    }

    const row = await prisma.productType.upsert({
      where: { code: type.code },
      create: {
        code: type.code,
        name: type.name,
        parentTypeId: parentTypeId ?? null,
        weightMode: type.weightMode,
        barcodePrefixes: type.barcodePrefixes ?? [],
        markType: type.markType ?? null,
        rules: type.rules as any,
        isSystem: true,
        sortOrder: type.sortOrder,
      },
      update: {
        name: type.name,
        parentTypeId: parentTypeId ?? null,
        weightMode: type.weightMode,
        barcodePrefixes: type.barcodePrefixes ?? [],
        markType: type.markType ?? null,
        rules: type.rules as any,
        isSystem: true,
        sortOrder: type.sortOrder,
      },
    });

    idByCode.set(type.code, row.id);
    console.log(`Upserted product type: ${type.code} (${row.id})`);
  }

  console.log('Product type seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Product type seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
