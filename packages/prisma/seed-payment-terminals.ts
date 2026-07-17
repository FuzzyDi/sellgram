// Seeds store-level PaymentTerminal rows (docs/POS_SETTINGS_ARCHITECTURE.md
// §9 step 2) for Demo Store Tashkent, migrating its current
// PosSettings.payload.paymentMethods (a flat string[], §1 of that
// document) into the new per-type PaymentTerminal table. Deliberately a
// separate script from seed.ts (same reasoning as
// seed-platform-policies.ts's own header comment: PaymentTerminal rows
// for a specific real store should not be tangled into seed.ts's
// demo-tenant reset/reseed cycle). Safe to run repeatedly — upserts by
// (storeId, deviceId: null, type) via a manual find-then-create/update,
// since PaymentTerminal has no @@unique on that combination to upsert
// against (same reasoning as seed-platform-policies.ts's own
// find-then-create/update, not a literal Prisma `upsert`).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// docs/POS_SYNC_API.md §23.1's real recorded paymentMethods for this
// store is ["CASH", "CARD", "QR_PAYME", "QR_CLICK", "QR_STATIC_MANUAL",
// "BANK_TRANSFER"] — six methods, reconciled 1:1 below (CARD ->
// CARD_PINPAD, the real PaymentTerminal.type name for that method;
// QR_STATIC_MANUAL kept as its own real type, not folded into
// QR_STATIC). QR_UZQR is the one genuine addition: a seventh terminal
// with no corresponding entry in §23.1's array at all, seeded ahead of
// the UzQR integration this store doesn't have configured yet.
const STORE_ID = 'cmmpdwno70007b4s3rguss5mk';
const TENANT_ID = 'cmmpdwnnz0000b4s3jamcnw5m';

const SEED_TERMINALS: { type: string; name: string; enabled: boolean; sortOrder: number; config: Record<string, unknown> }[] = [
  { type: 'CASH', name: 'Наличные', enabled: true, sortOrder: 0, config: {} },
  { type: 'CARD_PINPAD', name: 'Банковская карта', enabled: true, sortOrder: 1, config: {} },
  {
    type: 'QR_UZQR',
    name: 'UzQR',
    enabled: true,
    sortOrder: 2,
    config: {
      url: 'https://uzqr.uz',
      tin: 'DEMO_TIN',
      apiKey: 'DEMO_API_KEY',
      connectTimeoutSeconds: 3,
      responseTimeoutSeconds: 10,
      retryCount: 5,
    },
  },
  { type: 'QR_PAYME', name: 'Payme', enabled: true, sortOrder: 3, config: {} },
  { type: 'QR_CLICK', name: 'Click', enabled: true, sortOrder: 4, config: {} },
  { type: 'QR_STATIC_MANUAL', name: 'QR (статический)', enabled: true, sortOrder: 5, config: {} },
  { type: 'BANK_TRANSFER', name: 'Перевод', enabled: true, sortOrder: 6, config: {} },
];

async function main() {
  const store = await prisma.store.findUnique({ where: { id: STORE_ID }, select: { id: true, tenantId: true } });
  if (!store) throw new Error(`Store ${STORE_ID} not found — refusing to seed PaymentTerminal rows for a nonexistent store`);
  if (store.tenantId !== TENANT_ID) {
    throw new Error(`Store ${STORE_ID} belongs to tenant ${store.tenantId}, not the expected ${TENANT_ID} — refusing to seed`);
  }

  for (const terminal of SEED_TERMINALS) {
    const existing = await prisma.paymentTerminal.findFirst({
      where: { storeId: STORE_ID, deviceId: null, type: terminal.type },
    });
    if (existing) {
      await prisma.paymentTerminal.update({
        where: { id: existing.id },
        data: {
          name: terminal.name,
          enabled: terminal.enabled,
          sortOrder: terminal.sortOrder,
          config: terminal.config as any,
        },
      });
      console.log(`Updated payment terminal: ${terminal.type} (${existing.id})`);
    } else {
      const created = await prisma.paymentTerminal.create({
        data: {
          tenantId: TENANT_ID,
          storeId: STORE_ID,
          deviceId: null,
          type: terminal.type,
          name: terminal.name,
          enabled: terminal.enabled,
          sortOrder: terminal.sortOrder,
          config: terminal.config as any,
        },
      });
      console.log(`Created payment terminal: ${terminal.type} (${created.id})`);
    }
  }

  console.log('Payment terminal seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Payment terminal seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
