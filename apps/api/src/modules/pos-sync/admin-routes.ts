import type { FastifyInstance } from 'fastify';
import { randomInt, randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { encrypt, decrypt } from '../../lib/encrypt.js';
import { fetchProductTypesById, deriveProductTypeFields } from './product-type-rules.js';

const ACTIVATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const ACTIVATION_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function generateActivationCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += ACTIVATION_CODE_ALPHABET[randomInt(ACTIVATION_CODE_ALPHABET.length)];
  }
  return code;
}

const createDeviceSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1).max(200),
  deviceType: z.string().min(1).max(50).default('till'),
});

const catalogSnapshotSchema = z.object({
  storeId: z.string().min(1),
});

// docs/POS_SYNC_API.md §15 — the real contract's allowed command types
// (CloudCommandType enum, packages/prisma/schema.prisma) — a manual,
// admin-triggered send, distinct from fanOutCommandToActiveDevices'
// automatic REFRESH_CATALOG/REFRESH_SETTINGS fan-out above (this one
// targets exactly one device, any of the four types, and is never
// deduped against an existing PENDING command of the same type — an
// admin explicitly asking to PING a device twice gets two PING commands).
const createCommandSchema = z.object({
  deviceId: z.string().min(1),
  type: z.enum(['PING', 'REFRESH_CATALOG', 'REFRESH_SETTINGS', 'SHOW_MESSAGE']),
  payload: z.record(z.unknown()).default({}),
});

const listDevicesQuerySchema = z.object({
  storeId: z.string().min(1),
});

const getSettingsQuerySchema = z.object({
  storeId: z.string().min(1),
});

// Same empty eight-key document POST /pos-operators' bumpStaffVersion
// upserts for a store with no PosSettings row yet (docs/POS_SYNC_API.md
// §10) — GET returns it at version 0 rather than 404 so the admin UI can
// render a settings form for a store that hasn't been configured yet.
const EMPTY_POS_SETTINGS_PAYLOAD = {
  taxProfile: {},
  paymentMethods: [],
  receiptTemplate: {},
  printerProfile: {},
  fiscalProfile: {},
  offlineLimits: {},
  roundingRules: {},
  featureFlags: {},
};

// The eight-key settings body from docs/POS_SYNC_API.md §10. Internals are
// intentionally unconstrained (they depend on a fiscal integration partner
// not yet confirmed) — only the top-level keys and their object/array kind
// are enforced here.
const posSettingsSchema = z.object({
  storeId: z.string().min(1),
  settings: z.object({
    taxProfile: z.record(z.unknown()),
    paymentMethods: z.array(z.unknown()),
    receiptTemplate: z.record(z.unknown()),
    printerProfile: z.record(z.unknown()),
    fiscalProfile: z.record(z.unknown()),
    offlineLimits: z.record(z.unknown()),
    roundingRules: z.record(z.unknown()),
    featureFlags: z.record(z.unknown()),
  }),
});

// docs/POS_SETTINGS_ARCHITECTURE.md §6 — device-scoped hardware
// profiles. Every key optional/nullable and independently omittable —
// the admin UI saves one section at a time (§4), so a PUT typically
// carries only one key. Prisma's own "an undefined value in `data`
// means don't touch this column" behavior (not custom merge logic in
// the route handler) is what makes an omitted key leave the existing
// stored value alone; an explicit `null` clears that one section.
// Internals unconstrained (z.record(z.unknown())) — same "no existing
// shape to inherit, shape settles with real usage" reasoning as
// PosSettings.payload's own free-form keys.
//
// §10 (2026-07-18): both `pinpad` (lowercase, canonical on the wire —
// GET /pos/v1/settings, routes.ts) and `pinPad` (the model's actual
// Prisma column name, still accepted here for whatever admin UI build
// hasn't picked up the rename) are accepted on write. Resolved to a
// single value in the route handler below, not here — the schema's job
// is only "accept either spelling," not "decide which one wins."
const deviceSettingsSchema = z.object({
  printer: z.record(z.unknown()).nullable().optional(),
  scanner: z.record(z.unknown()).nullable().optional(),
  pinpad: z.record(z.unknown()).nullable().optional(),
  pinPad: z.record(z.unknown()).nullable().optional(),
  scale: z.record(z.unknown()).nullable().optional(),
  display: z.record(z.unknown()).nullable().optional(),
});

const listShiftsQuerySchema = z.object({
  storeId: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});

const listReceiptsQuerySchema = z.object({
  storeId: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  shiftNumber: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});

const listOperatorEventsQuerySchema = z.object({
  storeId: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});

const listPaymentEventsQuerySchema = z.object({
  storeId: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});

const listPaymentTerminalsQuerySchema = z.object({
  storeId: z.string().min(1),
});

// docs/POS_SETTINGS_ARCHITECTURE.md §3 — `type` stays a free string here
// too (not re-validated against the seven documented values), same
// "grows without a migration" reasoning the schema comment on
// PaymentTerminal.type already gives. deviceId nullable/optional: absent
// or explicit null both mean "store-level default" (§4); a device
// override is created by setting it to a real device id, checked
// against this store server-side below (never trusted from the client
// alone).
const createPaymentTerminalSchema = z.object({
  storeId: z.string().min(1),
  deviceId: z.string().min(1).nullable().optional(),
  type: z.string().min(1),
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  config: z.record(z.unknown()).default({}),
});

const updatePaymentTerminalSchema = z
  .object({
    deviceId: z.string().min(1).nullable(),
    type: z.string().min(1),
    name: z.string().min(1).max(200),
    enabled: z.boolean(),
    sortOrder: z.number().int(),
    config: z.record(z.unknown()),
  })
  .partial();

const posAnalyticsQuerySchema = z
  .object({
    storeId: z.string().min(1),
    period: z.enum(['today', 'week', 'month', 'custom']).default('today'),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
  })
  .refine((v) => v.period !== 'custom' || (v.from && v.to), {
    message: 'from and to are required when period=custom',
  });

// today/week/month are rolling windows ending "now", not calendar-aligned
// (matches modules/analytics/routes.ts's own "last N days" convention,
// which this endpoint otherwise mirrors) — custom uses the caller's own
// from/to, with `to` pushed to end-of-day so a date-only string like
// "2026-07-01" is treated as inclusive of that whole day.
function resolvePeriodRange(period: string, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();
  if (period === 'custom') {
    const start = new Date(from!);
    const end = new Date(to!);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('INVALID_DATE_RANGE');
    }
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 1;
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end: now };
}

// items/payments are stored as unconstrained Json (z.record(z.unknown())
// on the wire, docs/POS_SYNC_API.md — see fiscalEventSchema in
// pos-sync/routes.ts) — no fixed field names guaranteed, so aggregation
// below picks the most plausible key aliases a till might send. Same
// reasoning/alias list as PosReceipts.tsx's client-side `pick()` helper.
function pickField(obj: any, keys: string[]): any {
  for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

const posOperatorRoleSchema = z.enum(['CASHIER', 'SENIOR_CASHIER', 'ADMIN']);

// docs/POS_POLICY_ENGINE.md §14.6 — each role's full permission set,
// SENIOR_CASHIER/ADMIN each including everything the role below them
// has (spelled out per-role, not computed by concatenation, so this
// constant reads the same as the §14.6 table it was transcribed from).
// Used to default permissions[] on create (below) and to re-derive it
// on a role change (PATCH below) — not enforced as a ceiling on what a
// tenant can otherwise set (§14.6 already flags that as a separate,
// not-yet-implemented open item).
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  CASHIER: [
    'SHIFT_OPEN', 'SALE_CREATE', 'SALE_COMPLETE',
    'REFUND_CREATE_OWN_OR_BY_RECEIPT', 'CUSTOMER_LOOKUP',
    'CUSTOMER_CREATE', 'X_REPORT_PRINT', 'REPRINT_RECEIPT_COPY',
  ],
  SENIOR_CASHIER: [
    'SHIFT_OPEN', 'SALE_CREATE', 'SALE_COMPLETE',
    'REFUND_CREATE_OWN_OR_BY_RECEIPT', 'CUSTOMER_LOOKUP',
    'CUSTOMER_CREATE', 'X_REPORT_PRINT', 'REPRINT_RECEIPT_COPY',
    'SHIFT_CLOSE', 'REFUND_APPROVE', 'REFUND_COMPLETE',
    'DISCOUNT_APPLY', 'PRICE_OVERRIDE_LIMITED', 'CASH_IN',
    'CASH_OUT', 'VIEW_SHIFT_TOTALS', 'RECOVERY_RECEIPTS',
  ],
  ADMIN: [
    'SHIFT_OPEN', 'SALE_CREATE', 'SALE_COMPLETE',
    'REFUND_CREATE_OWN_OR_BY_RECEIPT', 'CUSTOMER_LOOKUP',
    'CUSTOMER_CREATE', 'X_REPORT_PRINT', 'REPRINT_RECEIPT_COPY',
    'SHIFT_CLOSE', 'REFUND_APPROVE', 'REFUND_COMPLETE',
    'DISCOUNT_APPLY', 'PRICE_OVERRIDE_LIMITED', 'CASH_IN',
    'CASH_OUT', 'VIEW_SHIFT_TOTALS', 'RECOVERY_RECEIPTS',
    'POS_SETTINGS_EDIT', 'HARDWARE_SETTINGS_EDIT', 'OPERATOR_SWITCH',
    'POLICY_VIEW', 'FORCE_SYNC', 'OUTBOX_REQUEUE', 'DEV_DIAGNOSTICS',
  ],
};

const listOperatorsQuerySchema = z.object({
  storeId: z.string().min(1),
});

// docs/POS_POLICY_ENGINE.md §14.1 — 4-6 digit PIN, plaintext accepted
// only at the API boundary to be hashed immediately (hashPin() below);
// never stored, never echoed back in any response.
const pinSchema = z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits');

const createOperatorSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1).max(200),
  role: posOperatorRoleSchema,
  permissions: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  pin: pinSchema.optional(),
  pinRequired: z.boolean().optional(),
});

const updateOperatorSchema = z
  .object({
    name: z.string().min(1).max(200),
    role: posOperatorRoleSchema,
    permissions: z.array(z.string()),
    active: z.boolean(),
    pin: pinSchema,
    pinRequired: z.boolean(),
  })
  .partial();

// Never selected/returned alongside pinHashSha256/pinSalt in any API
// response — those two columns are server-side-only (schema comment on
// PosOperator.pinHashSha256). pinRequired is the only PIN-related field
// a client (admin UI or till) ever needs or gets.
const OPERATOR_SAFE_SELECT = {
  id: true,
  tenantId: true,
  storeId: true,
  name: true,
  role: true,
  permissions: true,
  active: true,
  pinRequired: true,
  createdAt: true,
  updatedAt: true,
} as const;

// docs/POS_POLICY_ENGINE.md §14.1. SHA-256 of a per-operator random salt
// + the plaintext PIN — the plaintext itself only ever exists in the
// request body for the duration of the handler that calls this, never
// persisted. See the schema comment on PosOperator.pinHashSha256 for
// why this hash+salt pair must never be shipped to a till (GET
// /pos/v1/settings sends pinRequired only, not these) or returned from
// any admin-facing response (OPERATOR_SAFE_SELECT above excludes both).
function hashPin(pin: string): { pinHashSha256: string; pinSalt: string } {
  const pinSalt = randomBytes(16).toString('hex');
  const pinHashSha256 = createHash('sha256').update(pinSalt + pin).digest('hex');
  return { pinHashSha256, pinSalt };
}

// Bumps PosSettings.staffVersion for this store on every PosOperator
// create/update/delete (docs/POS_POLICY_ENGINE.md §14/§5) — same
// independent-counter pattern as policiesVersion/printTemplatesVersion.
// A store with no PosSettings row yet gets one created with defaults
// (the eight-key empty document, §10 of docs/POS_SYNC_API.md) rather than
// failing — staff management must not depend on settings having been
// configured first.
async function bumpStaffVersion(tenantId: string, storeId: string) {
  await prisma.posSettings.upsert({
    where: { storeId },
    create: {
      tenantId,
      storeId,
      payload: {
        taxProfile: {},
        paymentMethods: [],
        receiptTemplate: {},
        printerProfile: {},
        fiscalProfile: {},
        offlineLimits: {},
        roundingRules: {},
        featureFlags: {},
      },
    },
    update: { staffVersion: { increment: 1 } },
  });
}

// docs/POS_SYNC_API.md §15 — creates a PENDING CloudCommand of `type`
// for every ACTIVE device at this store, skipping any device that
// already has a PENDING command of the same `type` (a device offline
// for a while must not accumulate ten redundant REFRESH_CATALOG
// commands from ten separate catalog edits — one pending refresh is
// enough to cover all of them once it finally polls). There is no
// @@unique on CloudCommand for (deviceId, type, status) to let
// `createMany`'s own `skipDuplicates` express this — that flag only
// skips rows violating a real unique constraint, which doesn't exist
// here — so the exclusion is a plain pre-query instead.
async function fanOutCommandToActiveDevices(
  tenantId: string,
  storeId: string,
  type: 'REFRESH_CATALOG' | 'REFRESH_SETTINGS',
  payload: Record<string, unknown>
) {
  const activeDevices = await prisma.posDevice.findMany({
    where: { tenantId, storeId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (activeDevices.length === 0) return;

  const alreadyPending = await prisma.cloudCommand.findMany({
    where: {
      tenantId,
      deviceId: { in: activeDevices.map((d) => d.id) },
      type,
      status: 'PENDING',
    },
    select: { deviceId: true },
  });
  const alreadyPendingDeviceIds = new Set(alreadyPending.map((c) => c.deviceId));
  const targets = activeDevices.filter((d) => !alreadyPendingDeviceIds.has(d.id));
  if (targets.length === 0) return;

  await prisma.cloudCommand.createMany({
    data: targets.map((d) => ({
      tenantId,
      deviceId: d.id,
      type,
      payload: payload as any,
      status: 'PENDING' as const,
    })),
  });
}

// docs/POS_SETTINGS_ARCHITECTURE.md §5/§8 — exact-match key names only,
// not alias-aware the way GET /pos/v1/settings' Android alias list is
// (routes.ts §4 comment) — deliberately narrower here, since this is a
// display-masking convenience for the admin UI, not a wire contract a
// device depends on. A provider config key spelled differently (e.g.
// `secretKey`) is not masked by this list; widen it if that turns out
// to matter in practice.
// Exported — decryptSecrets below is imported into pos-sync/routes.ts
// (GET /pos/v1/settings) so it shares this exact key list rather than
// a second, potentially-drifting copy.
export const SECRET_CONFIG_KEYS = new Set(['apiKey', 'api_key', 'key', 'secret', 'password', 'token']);

// GET /pos/v1/settings (a different file, pos-sync/routes.ts) sends
// PaymentTerminal.config to the device in full — the till needs a
// working key to call the payment provider itself. Every ADMIN-facing
// response in *this* file must never do that: secrets are replaced with
// a fixed placeholder, never partially shown, never logged. Top-level
// keys only — every config shape documented in
// docs/POS_SETTINGS_ARCHITECTURE.md §3.2 is flat, not nested.
function maskSecrets(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== 'object') return {};
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    masked[key] = SECRET_CONFIG_KEYS.has(key) ? '••••••' : value;
  }
  return masked;
}

function maskTerminal<T extends { config: unknown }>(terminal: T): T {
  return { ...terminal, config: maskSecrets(terminal.config) };
}

// apps/api/src/lib/encrypt.ts's own output shape: `${iv}:${encrypted}:${tag}`
// hex-joined, iv/tag each 16 raw bytes (32 hex chars), encrypted variable
// length. Used both to skip re-encrypting an already-encrypted value
// (encryptSecrets) and to decide whether a value is worth attempting to
// decrypt at all (decryptSecrets) — a value that merely happens to
// contain colons but isn't real ciphertext (or plaintext left over from
// before this feature existed) never reaches decrypt().
const ENCRYPTED_VALUE_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+:[0-9a-f]{32}$/i;

function isEncryptedValue(value: string): boolean {
  return ENCRYPTED_VALUE_PATTERN.test(value);
}

// Encrypts every SECRET_CONFIG_KEYS value in `config` that is a
// non-empty string — skipping any value already in encrypt.ts's
// iv:encrypted:tag shape rather than encrypting it a second time. That
// skip is what makes this safe to call on a config assembled by PATCH's
// merge step below, which can legitimately contain a mix of freshly
// admin-typed plaintext (needs encrypting) and values just carried over
// verbatim from the existing stored (already encrypted) config — without
// it, every PATCH would double-encrypt any secret the admin didn't touch.
export function encryptSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const key of Object.keys(result)) {
    if (!SECRET_CONFIG_KEYS.has(key)) continue;
    const value = result[key];
    if (typeof value !== 'string' || value === '' || isEncryptedValue(value)) continue;
    result[key] = encrypt(value);
  }
  return result;
}

// Decrypts every SECRET_CONFIG_KEYS value that looks like ciphertext
// (isEncryptedValue) — a value that doesn't match that shape (empty,
// never-encrypted legacy plaintext, or a value that just happens to
// contain colons) is returned unchanged, not passed to decrypt() at
// all. Per-field try/catch: a value that matches the shape but fails to
// actually decrypt (wrong key, corrupted data) must not take down the
// whole GET /pos/v1/settings response for a device — it comes back
// as-is rather than throwing.
export function decryptSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const key of Object.keys(result)) {
    if (!SECRET_CONFIG_KEYS.has(key)) continue;
    const value = result[key];
    if (typeof value !== 'string' || !isEncryptedValue(value)) continue;
    try {
      result[key] = decrypt(value);
    } catch {
      // Leave the (undecryptable) value as-is — see comment above.
    }
  }
  return result;
}

/**
 * Store-admin endpoints for POS device onboarding. Registered under
 * /api/store-admin — see docs/SBGCLOUD_ARCHITECTURE.md for the boundary
 * these devices operate under (Local POS Core, not this API).
 */
export default async function posDeviceAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // Create a new device + a one-time activation code to key in at the till.
  fastify.post(
    '/pos-devices',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const body = createDeviceSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: body.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const device = await prisma.posDevice.create({
        data: {
          tenantId,
          storeId: store.id,
          name: body.data.name,
          deviceType: body.data.deviceType,
        },
        select: { id: true, name: true, deviceType: true, status: true, storeId: true, createdAt: true },
      });

      // activationCode is @unique — retry on the (very unlikely) collision.
      let activation;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          activation = await prisma.deviceActivation.create({
            data: {
              deviceId: device.id,
              activationCode: generateActivationCode(),
              expiresAt: new Date(Date.now() + ACTIVATION_CODE_TTL_MS),
            },
            select: { activationCode: true, expiresAt: true },
          });
          break;
        } catch (err: any) {
          if (err?.code !== 'P2002' || attempt === 4) throw err;
        }
      }

      return reply.status(201).send({
        success: true,
        data: {
          device,
          activationCode: activation!.activationCode,
          expiresAt: activation!.expiresAt,
        },
      });
    }
  );

  // List a store's POS devices for the fleet screen (admin UI only —
  // devices themselves never call this, they only ever see their own
  // record via /pos/v1/heartbeat).
  fastify.get(
    '/pos-devices',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const query = listDevicesQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: query.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: query.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const devices = await prisma.posDevice.findMany({
        where: { tenantId, storeId: store.id },
        select: {
          id: true, name: true, deviceType: true, status: true,
          deviceCode: true, lastSeenAt: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // docs/POS_SYNC_API.md §15 — pending command count per device for
      // the fleet screen (PosDevices.tsx), batched via groupBy rather
      // than one cloudCommand.count() per device (no N+1, same
      // discipline as GET /pos-operator-events' operator-name batch
      // resolution).
      const pendingCounts = devices.length
        ? await prisma.cloudCommand.groupBy({
            by: ['deviceId'],
            where: { deviceId: { in: devices.map((d) => d.id) }, status: 'PENDING' },
            _count: { id: true },
          })
        : [];
      const pendingCountByDeviceId = new Map(pendingCounts.map((c) => [c.deviceId, c._count.id]));

      const devicesWithCommandCounts = devices.map((d) => ({
        ...d,
        pendingCommandsCount: pendingCountByDeviceId.get(d.id) ?? 0,
      }));

      return reply.status(200).send({ success: true, data: devicesWithCommandCounts });
    }
  );

  // docs/POS_SYNC_API.md §15 — manual, admin-triggered command send for
  // one specific device (a "Ping this till" / "Show this message" button
  // in the admin UI), distinct from fanOutCommandToActiveDevices' own
  // automatic store-wide fan-out.
  fastify.post(
    '/pos-devices/commands',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const body = createCommandSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      const device = await prisma.posDevice.findFirst({
        where: { id: body.data.deviceId, tenantId },
        select: { id: true },
      });
      if (!device) return reply.status(404).send({ success: false, error: 'Device not found' });

      const command = await prisma.cloudCommand.create({
        data: {
          tenantId,
          deviceId: device.id,
          type: body.data.type,
          payload: body.data.payload as any,
          status: 'PENDING',
        },
        select: { id: true, deviceId: true, type: true, payload: true, status: true, createdAt: true },
      });

      return reply.status(201).send({ success: true, data: command });
    }
  );

  // Manually build and store a catalog snapshot for a store's devices to pull.
  // Not triggered automatically on product/category changes — see
  // docs/SBGCLOUD_ARCHITECTURE.md §13 (future sprint work).
  fastify.post(
    '/pos-devices/catalog-snapshot',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const body = catalogSnapshotSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: body.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const products = await prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          currency: true,
          stockQty: true,
          categoryId: true,
          // Per-item VAT/marking (docs/POS_SYNC_API.md §10/§12; schema
          // comment on Product) — a till needs these at sale time to (a)
          // apply the right VAT rate, falling back to
          // settings.taxProfile.vatRate when vatRate is null, and (b)
          // know whether to prompt for a marking code (isMarked=true)
          // and which classification it is (markType).
          vatRate: true,
          vatExempt: true,
          markType: true,
          isMarked: true,
          mxikCode: true,
          packageCode: true,
          // Unit of measure + weighted-goods sale (docs/POS_SYNC_API.md
          // §10's weightBarcode key; schema comment on Product) — a till
          // uses unit for display, isByWeight/isWeightedPiece to decide
          // whether to prompt for a weight/qty, pluCode to resolve a
          // scanned weight barcode back to this Product, and
          // pricePerKg ?? price to compute the line total.
          unit: true,
          isByWeight: true,
          isWeightedPiece: true,
          pluCode: true,
          pricePerKg: true,
          // packages/prisma/schema.prisma ProductBarcode — a till scans
          // any of these to resolve back to this Product, and uses
          // unitQty to decrement stock by the right multiple for a
          // case/block barcode (not necessarily 1).
          barcodes: {
            select: { id: true, barcode: true, type: true, isDefault: true, unitQty: true, variantId: true },
          },
          variants: {
            where: { isActive: true },
            select: { id: true, name: true, sku: true, price: true, stockQty: true },
          },
          // docs/PRODUCT_TYPES.md §6 — productTypeId is the FK read
          // directly off Product (used to walk the parent chain via
          // typesById below); the nested productType select covers the
          // fields read straight from the assigned type without needing
          // the chain (code/weightMode/barcodePrefixes).
          productTypeId: true,
          productType: {
            select: { code: true, rules: true, weightMode: true, barcodePrefixes: true, parentTypeId: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const categories = await prisma.category.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, slug: true, sortOrder: true, parentId: true },
        orderBy: { sortOrder: 'asc' },
      });

      // docs/PRODUCT_TYPES.md §4/§6 — shared with routes.ts's
      // product-search endpoint (product-type-rules.ts), not a local
      // copy anymore.
      const typesById = await fetchProductTypesById();
      const productsForSnapshot = products.map(({ productType, ...product }) => ({
        ...product,
        ...deriveProductTypeFields(product, productType, typesById),
      }));

      const last = await prisma.catalogSnapshot.findFirst({
        where: { tenantId, storeId: store.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;

      const snapshot = await prisma.catalogSnapshot.create({
        data: {
          tenantId,
          storeId: store.id,
          version,
          // barcodes/uzProfiles have no backing model yet (Barcode/
          // ProductUzProfile, docs/SBGCLOUD_ARCHITECTURE.md §12) — stored
          // empty so the payload shape matches docs/POS_SYNC_API.md §9.
          payload: { categories, products: productsForSnapshot, barcodes: [], uzProfiles: [] } as any,
        },
        select: { id: true, version: true, createdAt: true },
      });

      // docs/POS_SYNC_API.md §15 — a fresh snapshot is only useful once a
      // device actually pulls it; a REFRESH_CATALOG command nudges an
      // idle device to poll GET /pos/v1/catalog/snapshot sooner than its
      // own periodic schedule, via heartbeat's pendingCommandsCount.
      await fanOutCommandToActiveDevices(tenantId, store.id, 'REFRESH_CATALOG', { catalogVersion: snapshot.version });

      return reply.status(201).send({ success: true, data: snapshot });
    }
  );

  // Read the store's POS settings document for the admin settings screen —
  // mirrors PUT's tenant scoping, but returns the eight-key defaults at
  // version 0 for a store that hasn't been configured yet instead of 404
  // (docs/POS_SYNC_API.md §10: "unconfigured stores get empty eight-key
  // defaults at version 1" describes devices' first GET /pos/v1/settings
  // pull, not this admin read — no PosSettings row is created here, only
  // on first PUT/staff write, so version 0 signals "nothing saved yet").
  fastify.get(
    '/pos-devices/settings',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const query = getSettingsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: query.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: query.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const settings = await prisma.posSettings.findUnique({
        where: { storeId: store.id },
        select: { storeId: true, version: true, payload: true, updatedAt: true },
      });

      return reply.status(200).send({
        success: true,
        data: settings ?? { storeId: store.id, version: 0, payload: EMPTY_POS_SETTINGS_PAYLOAD, updatedAt: null },
      });
    }
  );

  // Upsert the store's POS settings document (docs/POS_SYNC_API.md §10).
  // Devices pull it via GET /pos/v1/settings; version bumps on every write
  // so heartbeat's settingsVersion tells devices when to re-pull.
  fastify.put(
    '/pos-devices/settings',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const body = posSettingsSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: body.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const settings = await prisma.posSettings.upsert({
        where: { storeId: store.id },
        create: {
          tenantId,
          storeId: store.id,
          version: 1,
          payload: body.data.settings as any,
        },
        update: {
          version: { increment: 1 },
          payload: body.data.settings as any,
        },
        select: { storeId: true, version: true, updatedAt: true },
      });

      // docs/POS_SYNC_API.md §15 — same nudge as catalog-snapshot's
      // REFRESH_CATALOG fan-out above, for settings.
      await fanOutCommandToActiveDevices(tenantId, store.id, 'REFRESH_SETTINGS', { settingsVersion: settings.version });

      return reply.status(200).send({ success: true, data: settings });
    }
  );

  // docs/POS_SETTINGS_ARCHITECTURE.md §6/§9 step 5 — device-scoped
  // hardware profiles, sibling of /pos-devices/settings (store-scoped)
  // above but keyed on a specific device, not a store. Read returns
  // `null` for every field on a device that has never been configured
  // (no row created just to read it) — same "reading doesn't create"
  // posture as GET /pos-devices/settings not creating a PosSettings row.
  fastify.get(
    '/pos-devices/:deviceId/settings',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { deviceId } = request.params as { deviceId: string };

      const device = await prisma.posDevice.findFirst({ where: { id: deviceId, tenantId }, select: { id: true } });
      if (!device) return reply.status(404).send({ success: false, error: 'Device not found' });

      const settings = await prisma.posDeviceSettings.findUnique({
        where: { deviceId: device.id },
        select: { printer: true, scanner: true, pinPad: true, scale: true, display: true, updatedAt: true },
      });

      return reply.status(200).send({
        success: true,
        data: settings ?? { printer: null, scanner: null, pinPad: null, scale: null, display: null, updatedAt: null },
      });
    }
  );

  // Upsert — same shape as PUT /pos-devices/settings above (create on
  // first write, update thereafter), but per-section: only keys present
  // in the body are written (schema comment on deviceSettingsSchema).
  fastify.put(
    '/pos-devices/:deviceId/settings',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { deviceId } = request.params as { deviceId: string };
      const body = deviceSettingsSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      const device = await prisma.posDevice.findFirst({ where: { id: deviceId, tenantId }, select: { id: true } });
      if (!device) return reply.status(404).send({ success: false, error: 'Device not found' });

      // §10 — `pinpad` (canonical) wins if the caller sent it at all
      // (checked by key presence, not truthiness — an explicit
      // `pinpad: null` must still win over a stale `pinPad` value in
      // the same body); falls back to `pinPad` only when `pinpad` is
      // entirely absent. Either way, exactly one value reaches the
      // model's own `pinPad` column — never a partial merge of both.
      const pinPadValue = 'pinpad' in body.data ? body.data.pinpad : body.data.pinPad;
      const fields = {
        printer: body.data.printer as any,
        scanner: body.data.scanner as any,
        pinPad: pinPadValue as any,
        scale: body.data.scale as any,
        display: body.data.display as any,
      };

      const settings = await prisma.posDeviceSettings.upsert({
        where: { deviceId: device.id },
        create: { deviceId: device.id, ...fields },
        update: fields,
        select: { printer: true, scanner: true, pinPad: true, scale: true, display: true, updatedAt: true },
      });

      return reply.status(200).send({ success: true, data: settings });
    }
  );

  // Closed shifts (Z-reports) for the Shifts admin screen. SHIFT_CLOSED is
  // the only eventType that represents a completed shift with a final
  // zReportStatus — SHIFT_OPENED rows are the till's own append-only
  // opening record and aren't shown here. Cursor pagination follows
  // Prisma's native cursor+skip:1 scheme, keyed on `id` (unique) but still
  // correctly resuming in closedAtMs DESC order — Prisma seeks by the
  // cursor row's position in that ordering, not by literal id comparison.
  fastify.get(
    '/pos-shifts',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const query = listShiftsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: query.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: query.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const shifts = await prisma.shiftEvent.findMany({
        where: {
          tenantId,
          storeId: store.id,
          eventType: 'SHIFT_CLOSED',
          ...(query.data.deviceId ? { deviceId: query.data.deviceId } : {}),
        },
        select: {
          id: true,
          shiftNumber: true,
          openedAtMs: true,
          closedAtMs: true,
          zReportStatus: true,
          deviceId: true,
          device: { select: { name: true } },
        },
        orderBy: { closedAtMs: 'desc' },
        take: query.data.limit,
        ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
      });

      const nextCursor = shifts.length === query.data.limit ? shifts[shifts.length - 1]!.id : null;

      return reply.status(200).send({ success: true, data: { items: shifts, nextCursor } });
    }
  );

  // Successfully fiscalized receipts for the Receipts admin screen.
  // FISCAL_SUCCESS is the only eventType with a real, complete receipt
  // (FISCAL_STARTED/FISCAL_FAILED/FISCAL_UNKNOWN don't carry a finished
  // fiscalSign/fiscalQr). Same cursor pagination scheme as /pos-shifts,
  // ordered by createdAtMs DESC.
  fastify.get(
    '/pos-receipts',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const query = listReceiptsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: query.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: query.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const receipts = await prisma.fiscalEvent.findMany({
        where: {
          tenantId,
          storeId: store.id,
          eventType: 'FISCAL_SUCCESS',
          ...(query.data.deviceId ? { deviceId: query.data.deviceId } : {}),
          ...(query.data.shiftNumber !== undefined ? { shiftNumber: query.data.shiftNumber } : {}),
        },
        select: {
          id: true,
          localReceiptId: true,
          receiptNumber: true,
          receiptType: true,
          totalAmount: true,
          currency: true,
          payments: true,
          items: true,
          fiscalStatus: true,
          fiscalQr: true,
          fiscalSign: true,
          createdAtMs: true,
          shiftNumber: true,
          deviceId: true,
          device: { select: { name: true } },
          operatorId: true,
          operatorName: true,
          operatorRole: true,
        },
        orderBy: { createdAtMs: 'desc' },
        take: query.data.limit,
        ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
      });

      const nextCursor = receipts.length === query.data.limit ? receipts[receipts.length - 1]!.id : null;

      return reply.status(200).send({ success: true, data: { items: receipts, nextCursor } });
    }
  );

  // Operator audit trail (docs/POS_SYNC_API.md §24) for the Events admin
  // screen. Same cursor pagination scheme as /pos-shifts/-receipts,
  // ordered by createdAt DESC. operatorId/actorId are plain strings with
  // no Prisma @relation (schema.prisma's PosOperatorEvent comment —
  // accept-don't-reject means an id Cloud doesn't recognize is still
  // stored), so operator names are resolved with a second, batched query
  // rather than a `select`-time join, and matched back onto each row here.
  fastify.get(
    '/pos-operator-events',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const query = listOperatorEventsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: query.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: query.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const events = await prisma.posOperatorEvent.findMany({
        where: {
          tenantId,
          storeId: store.id,
          ...(query.data.deviceId ? { deviceId: query.data.deviceId } : {}),
        },
        select: {
          id: true,
          eventType: true,
          operatorId: true,
          actorId: true,
          payload: true,
          createdAt: true,
          deviceId: true,
          device: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.data.limit,
        ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
      });

      const operatorIds = [...new Set(events.flatMap((e) => [e.operatorId, e.actorId]).filter((id): id is string => !!id))];
      const operators = operatorIds.length
        ? await prisma.posOperator.findMany({ where: { id: { in: operatorIds } }, select: { id: true, name: true } })
        : [];
      const operatorNameById = new Map(operators.map((o) => [o.id, o.name]));

      const items = events.map((e) => ({
        ...e,
        operatorName: e.operatorId ? operatorNameById.get(e.operatorId) ?? null : null,
        actorName: e.actorId ? operatorNameById.get(e.actorId) ?? null : null,
      }));

      const nextCursor = events.length === query.data.limit ? events[events.length - 1]!.id : null;

      return reply.status(200).send({ success: true, data: { items, nextCursor } });
    }
  );

  // Payment-provider events (docs/POS_SYNC_API.md §25) for the Payments
  // admin screen. Same cursor pagination scheme as /pos-shifts/-receipts/
  // -operator-events, ordered by createdAt DESC. cashierName/cashierRole
  // are already a stored snapshot on the row itself (schema comment on
  // PosPaymentEvent) — unlike /pos-operator-events, no second batched
  // query is needed here to resolve a name.
  fastify.get(
    '/pos-payment-events',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const query = listPaymentEventsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: query.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: query.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const events = await prisma.posPaymentEvent.findMany({
        where: {
          tenantId,
          storeId: store.id,
          ...(query.data.deviceId ? { deviceId: query.data.deviceId } : {}),
          ...(query.data.provider ? { provider: query.data.provider } : {}),
        },
        select: {
          id: true,
          eventType: true,
          aggregateId: true,
          provider: true,
          paymentMethod: true,
          operation: true,
          status: true,
          amount: true,
          currency: true,
          providerPaymentId: true,
          providerInvoiceId: true,
          providerRefundId: true,
          saleId: true,
          refundId: true,
          fiscalReceiptId: true,
          cashierId: true,
          cashierName: true,
          cashierRole: true,
          reason: true,
          rawProviderStatus: true,
          createdAt: true,
          deviceId: true,
          device: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.data.limit,
        ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
      });

      const nextCursor = events.length === query.data.limit ? events[events.length - 1]!.id : null;

      return reply.status(200).send({ success: true, data: { items: events, nextCursor } });
    }
  );

  // Aggregate analytics for the Analytics admin screen — shifts + receipts
  // summary, revenue-by-day series, payment-method breakdown, top products.
  // All aggregation happens in JS rather than SQL: items/payments are
  // unconstrained Json (see pickField's comment above), so there's no
  // column to GROUP BY at the database level.
  fastify.get(
    '/pos-analytics',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const query = posAnalyticsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: query.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: query.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      let range: { start: Date; end: Date };
      try {
        range = resolvePeriodRange(query.data.period, query.data.from, query.data.to);
      } catch {
        return reply.status(400).send({ success: false, error: 'Invalid from/to date' });
      }

      const [openedCount, closedShifts, receipts] = await Promise.all([
        prisma.shiftEvent.count({
          where: { tenantId, storeId: store.id, eventType: 'SHIFT_OPENED', openedAtMs: { gte: range.start, lte: range.end } },
        }),
        prisma.shiftEvent.findMany({
          where: { tenantId, storeId: store.id, eventType: 'SHIFT_CLOSED', closedAtMs: { gte: range.start, lte: range.end } },
          select: { openedAtMs: true, closedAtMs: true },
        }),
        prisma.fiscalEvent.findMany({
          where: { tenantId, storeId: store.id, eventType: 'FISCAL_SUCCESS', createdAtMs: { gte: range.start, lte: range.end } },
          select: { receiptType: true, totalAmount: true, payments: true, items: true, createdAtMs: true },
        }),
      ]);

      const durationsMinutes = closedShifts
        .filter((s) => s.openedAtMs && s.closedAtMs)
        .map((s) => (s.closedAtMs!.getTime() - s.openedAtMs!.getTime()) / 60000);
      const avgDuration = durationsMinutes.length
        ? Math.round(durationsMinutes.reduce((a, b) => a + b, 0) / durationsMinutes.length)
        : 0;

      const sales = receipts.filter((r) => r.receiptType === 'SALE').length;
      const refunds = receipts.filter((r) => r.receiptType === 'REFUND').length;
      const totalAmount = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const avgAmount = receipts.length ? Math.round(totalAmount / receipts.length) : 0;

      // Zero-fill every day in the range so the chart has a continuous
      // x-axis, same convention as modules/analytics/routes.ts's
      // fetchRevenueSeries.
      const byDateMap: Record<string, { amount: number; count: number }> = {};
      for (const r of receipts) {
        const date = r.createdAtMs.toISOString().slice(0, 10);
        if (!byDateMap[date]) byDateMap[date] = { amount: 0, count: 0 };
        byDateMap[date].amount += r.totalAmount || 0;
        byDateMap[date].count += 1;
      }
      const byDay: { date: string; amount: number; count: number }[] = [];
      const totalDays = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      const startDay = new Date(range.start);
      startDay.setUTCHours(0, 0, 0, 0);
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDay.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        byDay.push({ date: d, ...(byDateMap[d] || { amount: 0, count: 0 }) });
      }

      const byPaymentMap: Record<string, { amount: number; count: number }> = {};
      for (const r of receipts) {
        const payments = Array.isArray(r.payments) ? r.payments : [];
        for (const p of payments as any[]) {
          const method = String(pickField(p, ['type', 'method', 'paymentType']) ?? 'UNKNOWN');
          const amount = Number(pickField(p, ['sum', 'amount', 'total']) ?? 0);
          if (!byPaymentMap[method]) byPaymentMap[method] = { amount: 0, count: 0 };
          byPaymentMap[method].amount += amount;
          byPaymentMap[method].count += 1;
        }
      }
      const byPayment = Object.entries(byPaymentMap)
        .map(([method, v]) => ({ method, ...v }))
        .sort((a, b) => b.amount - a.amount);

      // A weighted item's fiscal qty is stored in grams (same convention
      // flagged in PosReceipts.tsx's formatItemQty) — accumulated here in
      // that raw native unit per product name, same as before, so summing
      // across receipts for one product never mixes a kg-item's grams
      // with a piece-item's count mid-sum. unit is captured once per
      // group, at the same point name/qty/amount already are.
      const topProductsMap: Record<string, { name: string; qty: number; amount: number; unit: string }> = {};
      for (const r of receipts) {
        const items = Array.isArray(r.items) ? r.items : [];
        for (const item of items as any[]) {
          const name = String(pickField(item, ['name', 'title', 'productName']) ?? 'Unknown');
          const qty = Number(pickField(item, ['qty', 'quantity']) ?? 0);
          const amount = Number(pickField(item, ['sum', 'total', 'amount']) ?? 0);
          const unit = pickField(item, ['unit']) ?? 'шт';
          if (!topProductsMap[name]) topProductsMap[name] = { name, qty: 0, amount: 0, unit };
          topProductsMap[name].qty += qty;
          topProductsMap[name].amount += amount;
        }
      }
      // Ranking stays on the raw accumulated qty (unchanged from before)
      // — converting to display units only after slicing to the top 10,
      // so the "which 10 products" selection isn't affected by this fix.
      const WEIGHT_KG_UNITS = ['кг', 'KG', 'kg'];
      const topProducts = Object.values(topProductsMap)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10)
        .map((p) => {
          const isKg = WEIGHT_KG_UNITS.includes(p.unit);
          return {
            name: p.name,
            qty: isKg ? Number((p.qty / 1000).toFixed(3)) : p.qty,
            amount: p.amount,
            unit: isKg ? 'кг' : p.unit,
          };
        });

      return reply.status(200).send({
        success: true,
        data: {
          shifts: { total: openedCount, completed: closedShifts.length, avgDuration },
          receipts: { total: receipts.length, sales, refunds, totalAmount, avgAmount },
          byDay,
          byPayment,
          topProducts,
        },
      });
    }
  );

  // POS staff/operators CRUD (docs/POS_POLICY_ENGINE.md §14) — PosOperator
  // is store-scoped and unrelated to User/Team, so this is a plain
  // tenant-isolated roster CRUD, not a permission-guard variant of the
  // existing user-management endpoints.
  fastify.get(
    '/pos-operators',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const query = listOperatorsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: query.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: query.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const operators = await prisma.posOperator.findMany({
        where: { tenantId, storeId: store.id },
        orderBy: { name: 'asc' },
        select: OPERATOR_SAFE_SELECT,
      });

      return reply.status(200).send({ success: true, data: operators });
    }
  );

  fastify.post(
    '/pos-operators',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const body = createOperatorSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: body.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      // §14.6 — an omitted permissions[] already defaults to [] via
      // createOperatorSchema; an explicitly empty array from the caller
      // is indistinguishable from "omitted" at this point and gets the
      // same treatment — either way, fall back to the role's default set
      // rather than creating an operator with no permissions at all.
      const permissions = body.data.permissions.length > 0
        ? body.data.permissions
        : DEFAULT_PERMISSIONS[body.data.role];

      // §14.1 — a plaintext pin, if present, is hashed immediately and
      // never itself passed to Prisma (no `pin` column exists). Present
      // pin wins over an explicit pinRequired: true (the point of
      // supplying a pin is to require it); pinRequired alone (no pin)
      // is honored as given — e.g. flagging an operator as
      // pin-required ahead of the PIN itself being set later.
      const pinFields = body.data.pin
        ? { ...hashPin(body.data.pin), pinRequired: true }
        : body.data.pinRequired !== undefined
          ? { pinRequired: body.data.pinRequired }
          : {};

      const operator = await prisma.posOperator.create({
        data: {
          tenantId,
          storeId: store.id,
          name: body.data.name,
          role: body.data.role,
          permissions,
          active: body.data.active,
          ...pinFields,
        },
        select: OPERATOR_SAFE_SELECT,
      });
      await bumpStaffVersion(tenantId, store.id);

      return reply.status(201).send({ success: true, data: operator });
    }
  );

  fastify.patch(
    '/pos-operators/:id',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params as { id: string };
      const body = updateOperatorSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      // Tenant isolation: an operator that exists but belongs to a
      // different tenant must not leak as "found" — 404, not 403.
      const existing = await prisma.posOperator.findFirst({ where: { id, tenantId }, select: { id: true, storeId: true } });
      if (!existing) return reply.status(404).send({ success: false, error: 'Operator not found' });

      // pin/pinRequired are pulled out of the plain object here — `pin`
      // in particular must never reach the Prisma `data` object below
      // (no such column), and both need bespoke merge logic distinct
      // from every other field's "present in body → overwrite" rule.
      const { pin, pinRequired: bodyPinRequired, ...restBody } = body.data;

      // §14.6 — updateOperatorSchema has no .default() on permissions
      // (unlike create above), so "omitted" and "explicitly []" are
      // still distinguishable here: body.data.permissions is undefined
      // only when the caller didn't send the key at all. A role change
      // with no explicit permissions in the same request re-derives
      // permissions from the new role's default set; an explicit
      // permissions[] in the request (even []) always wins and is left
      // untouched, same as every other field in this partial update.
      const data: any =
        restBody.role !== undefined && restBody.permissions === undefined
          ? { ...restBody, permissions: DEFAULT_PERMISSIONS[restBody.role] }
          : restBody;

      // §14.1 — pin present → recompute hash+salt and force
      // pinRequired: true. No pin but pinRequired explicitly given →
      // update just that boolean, leaving any existing hash/salt alone
      // (a PIN can be temporarily disabled without discarding it, and
      // re-enabled later without the admin re-entering it). Neither
      // field present → don't touch any of the three PIN columns at
      // all, exactly the "PATCH without pin never touches the existing
      // hash" requirement.
      if (pin) {
        Object.assign(data, hashPin(pin), { pinRequired: true });
      } else if (bodyPinRequired !== undefined) {
        data.pinRequired = bodyPinRequired;
      }

      const operator = await prisma.posOperator.update({
        where: { id: existing.id },
        data,
        select: OPERATOR_SAFE_SELECT,
      });
      await bumpStaffVersion(tenantId, existing.storeId);

      return reply.status(200).send({ success: true, data: operator });
    }
  );

  // §14.1 — explicit reset, distinct from PATCH {pinRequired: false}:
  // that only toggles the requirement flag and leaves hash/salt intact
  // (re-enabling later needs no re-entry); this clears the PIN
  // entirely. A manager who suspects a PIN was compromised needs this,
  // not the toggle.
  fastify.delete(
    '/pos-operators/:id/pin',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params as { id: string };

      const existing = await prisma.posOperator.findFirst({ where: { id, tenantId }, select: { id: true, storeId: true } });
      if (!existing) return reply.status(404).send({ success: false, error: 'Operator not found' });

      const operator = await prisma.posOperator.update({
        where: { id: existing.id },
        data: { pinRequired: false, pinHashSha256: null, pinSalt: null },
        select: OPERATOR_SAFE_SELECT,
      });
      await bumpStaffVersion(tenantId, existing.storeId);

      return reply.status(200).send({ success: true, data: operator });
    }
  );

  fastify.delete(
    '/pos-operators/:id',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params as { id: string };

      const existing = await prisma.posOperator.findFirst({ where: { id, tenantId }, select: { id: true, storeId: true } });
      if (!existing) return reply.status(404).send({ success: false, error: 'Operator not found' });

      await prisma.posOperator.delete({ where: { id: existing.id } });
      await bumpStaffVersion(tenantId, existing.storeId);

      return reply.status(200).send({ success: true, data: { id: existing.id } });
    }
  );

  // docs/POS_SETTINGS_ARCHITECTURE.md §9 step 4 — store-admin CRUD for
  // PaymentTerminal. Every response here goes through maskTerminal()
  // (defined above) — unlike GET /pos/v1/settings (pos-sync/routes.ts),
  // which sends config to a device in full, this is an admin-facing
  // surface and must never echo a secret back readable.
  fastify.get(
    '/payment-terminals',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const query = listPaymentTerminalsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: query.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: query.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const terminals = await prisma.paymentTerminal.findMany({
        where: { tenantId, storeId: store.id },
        orderBy: [{ sortOrder: 'asc' }, { type: 'asc' }],
      });

      return reply.status(200).send({ success: true, data: terminals.map(maskTerminal) });
    }
  );

  fastify.post(
    '/payment-terminals',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const body = createPaymentTerminalSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: body.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      // §3 — a device-level override must actually belong to this
      // store; same "server decides trust-sensitive associations"
      // posture already used for storeId above and throughout this
      // file (e.g. POST /pos-operators).
      if (body.data.deviceId) {
        const device = await prisma.posDevice.findFirst({
          where: { id: body.data.deviceId, storeId: store.id, tenantId },
          select: { id: true },
        });
        if (!device) return reply.status(404).send({ success: false, error: 'Device not found' });
      }

      const terminal = await prisma.paymentTerminal.create({
        data: {
          tenantId,
          storeId: store.id,
          deviceId: body.data.deviceId ?? null,
          type: body.data.type,
          name: body.data.name,
          enabled: body.data.enabled,
          sortOrder: body.data.sortOrder,
          config: encryptSecrets(body.data.config as Record<string, unknown>) as any,
        },
      });

      return reply.status(201).send({ success: true, data: maskTerminal(terminal) });
    }
  );

  fastify.patch(
    '/payment-terminals/:id',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params as { id: string };
      const body = updatePaymentTerminalSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      // Tenant isolation: a terminal that exists but belongs to a
      // different tenant must not leak as "found" — 404, not 403 (same
      // as every other PATCH/DELETE in this file).
      const existing = await prisma.paymentTerminal.findFirst({
        where: { id, tenantId },
        select: { id: true, storeId: true, config: true },
      });
      if (!existing) return reply.status(404).send({ success: false, error: 'Payment terminal not found' });

      if (body.data.deviceId) {
        const device = await prisma.posDevice.findFirst({
          where: { id: body.data.deviceId, storeId: existing.storeId, tenantId },
          select: { id: true },
        });
        if (!device) return reply.status(404).send({ success: false, error: 'Device not found' });
      }

      // The admin UI always sends back whatever config it displayed
      // (docs/POS_SETTINGS_ARCHITECTURE.md §8), and GET /payment-terminals
      // always masks secret-shaped keys to "••••••" (maskTerminal above)
      // — so an untouched secret field round-trips back here as that
      // literal placeholder, not the real value the UI was never given.
      // Writing it verbatim would permanently overwrite the real secret
      // with "••••••". For any key in SECRET_CONFIG_KEYS whose incoming
      // value is still exactly the placeholder, keep the existing stored
      // (already-encrypted) value for that key instead; any other value
      // (the admin actually typed something) is written as given, then
      // encrypted below. Merge starts from `existing.config`, not just
      // `incoming` — a key present in the stored config but omitted from
      // this PATCH's body must survive, not be silently dropped.
      const data: any = { ...body.data };
      if (data.config) {
        const existingConfig = existing.config && typeof existing.config === 'object' ? (existing.config as Record<string, unknown>) : {};
        const incoming = data.config as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...existingConfig, ...incoming };
        for (const key of Object.keys(incoming)) {
          if (SECRET_CONFIG_KEYS.has(key) && incoming[key] === '••••••' && key in existingConfig) {
            merged[key] = existingConfig[key];
          }
        }
        // encryptSecrets skips anything already in ciphertext shape —
        // the placeholder-preserved values restored just above (already
        // encrypted, carried over verbatim) pass through untouched here;
        // only genuinely new plaintext the admin just typed gets encrypted.
        data.config = encryptSecrets(merged);
      }

      const terminal = await prisma.paymentTerminal.update({
        where: { id: existing.id },
        data,
      });

      return reply.status(200).send({ success: true, data: maskTerminal(terminal) });
    }
  );

  fastify.delete(
    '/payment-terminals/:id',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const { id } = request.params as { id: string };

      const existing = await prisma.paymentTerminal.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ success: false, error: 'Payment terminal not found' });

      await prisma.paymentTerminal.delete({ where: { id: existing.id } });

      return reply.status(200).send({ success: true, data: { id: existing.id } });
    }
  );
}
