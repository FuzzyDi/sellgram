// Encrypts secret-shaped keys (apiKey/api_key/key/secret/password/token
// — same list as apps/api/src/modules/pos-sync/admin-routes.ts's
// SECRET_CONFIG_KEYS) already sitting in PaymentTerminal.config as
// plaintext, from before encryption existed
// (docs/POS_SETTINGS_ARCHITECTURE.md §5). Deliberately a standalone
// script, not importing apps/api/src/lib/encrypt.ts or admin-routes.ts's
// encryptSecrets — packages/prisma has no dependency on @sellgram/api
// and no other script in this directory cross-imports from apps/api/src
// (same reasoning seed-platform-policies.ts's own header gives for being
// a separate script from seed.ts: keep this package's scripts
// self-contained). The AES-256-GCM implementation below is copied
// verbatim from encrypt.ts, not reinvented — same algorithm, same key
// derivation, same `iv:encrypted:tag` hex-joined output format, so
// whatever this script writes is decryptable by the real endpoint's
// decrypt() later. Idempotent — a value already in that format is left
// untouched, so running this twice (or on a database that already has a
// mix of encrypted and legacy-plaintext rows) is safe.
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const ALGORITHM = 'aes-256-gcm';
const SECRET_CONFIG_KEYS = new Set(['apiKey', 'api_key', 'key', 'secret', 'password', 'token']);
const ENCRYPTED_VALUE_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+:[0-9a-f]{32}$/i;

function isEncryptedValue(value: string): boolean {
  return ENCRYPTED_VALUE_PATTERN.test(value);
}

function encrypt(text: string): string {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error('ENCRYPTION_KEY is not set in the environment — refusing to encrypt with no key');
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${tag}`;
}

// Mirrors admin-routes.ts's encryptSecrets exactly (skip already-
// encrypted values, skip empty/non-string values) — kept as a local
// copy rather than imported, per this file's header comment.
function encryptSecrets(config: Record<string, unknown>): { result: Record<string, unknown>; changed: boolean } {
  const result: Record<string, unknown> = { ...config };
  let changed = false;
  for (const key of Object.keys(result)) {
    if (!SECRET_CONFIG_KEYS.has(key)) continue;
    const value = result[key];
    if (typeof value !== 'string' || value === '' || isEncryptedValue(value)) continue;
    result[key] = encrypt(value);
    changed = true;
  }
  return { result, changed };
}

async function main() {
  const terminals = await prisma.paymentTerminal.findMany({
    select: { id: true, name: true, type: true, config: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const terminal of terminals) {
    const config = terminal.config && typeof terminal.config === 'object' ? (terminal.config as Record<string, unknown>) : {};
    const { result, changed } = encryptSecrets(config);

    if (!changed) {
      skipped++;
      continue;
    }

    await prisma.paymentTerminal.update({
      where: { id: terminal.id },
      data: { config: result as any },
    });
    updated++;
    console.log(`Encrypted secrets for payment terminal: ${terminal.type} "${terminal.name}" (${terminal.id})`);
  }

  console.log(`Payment terminal secret encryption completed: ${updated} updated, ${skipped} already encrypted or had no secrets.`);
}

main()
  .catch((e) => {
    console.error('Payment terminal secret encryption failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
