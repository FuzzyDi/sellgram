import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { getLicenseStatus } from '../../lib/billing.js';
import { resolveDevice } from './device-auth.js';
import { sendAck, sendError, sendSuccess } from './envelope.js';

/**
 * POS Sync API — see docs/SBGCLOUD_ARCHITECTURE.md.
 *
 * Implemented: device activation, heartbeat, catalog snapshot (manual,
 * admin-triggered — see admin-routes.ts), settings, and idempotent sale
 * and stock event ingestion (roadmap step 4 + §14). Fiscal/shift ingestion
 * and cloud commands are intentionally still stubs (501) — roadmap steps
 * 5-6, pending a confirmed fiscal integration partner for Uzbekistan.
 *
 * Do not wire Order/prisma.order access into this module — POS sale data is
 * kept out of the existing commerce domain model on purpose
 * (docs/SBGCLOUD_ARCHITECTURE.md §2, §12).
 */

function notImplemented(reply: FastifyReply, feature: string) {
  return reply.status(501).send({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message: `POS Sync API: ${feature} is not implemented yet`,
  });
}

function unauthorized(reply: FastifyReply, request: FastifyRequest) {
  return sendError(reply, 401, 'UNAUTHORIZED', 'Invalid or missing device key', request);
}

function normalizeHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// Dual-header auth, confirmed production flow with the SBG Lite POS
// Android team (docs/POS_SYNC_API.md §4/§22): X-Device-Code is a PUBLIC
// identifier (not a secret, safe to log); Authorization: Bearer
// <accessToken> remains the SOLE real auth factor, unchanged. Every
// authenticated endpoint except /activate (which predates having a
// device to check the header against) requires both — checked as a PAIR,
// not as two independent facts: the accessToken must have been issued
// FOR the deviceCode presented alongside it. A present-but-mismatching
// X-Device-Code (valid token, wrong/foreign code) is a potential security
// incident — logged, not silently ignored — and is a 401, not a 400,
// since the token itself is valid; it's the pairing that's wrong.
async function resolveAuthenticatedDevice(request: FastifyRequest, reply: FastifyReply) {
  const deviceCode = normalizeHeader(request.headers['x-device-code']);
  if (!deviceCode) {
    sendError(reply, 400, 'VALIDATION_ERROR', 'X-Device-Code header is required', request);
    return null;
  }

  const device = await resolveDevice(request.headers.authorization);
  if (!device) {
    unauthorized(reply, request);
    return null;
  }

  if (device.deviceCode !== deviceCode) {
    request.log.warn(
      { deviceId: device.id, providedDeviceCode: deviceCode, expectedDeviceCode: device.deviceCode },
      'pos-sync: X-Device-Code does not match the device this accessToken was issued for — mismatched credentials'
    );
    sendError(reply, 401, 'UNAUTHORIZED', 'X-Device-Code does not match the authenticated device', request);
    return null;
  }

  return device;
}

const activateSchema = z.object({
  activationCode: z.string().min(1),
  deviceFingerprint: z.string().min(1),
  deviceName: z.string().min(1),
  deviceType: z.enum(['WINDOWS', 'ANDROID', 'LANDI', 'WEB']),
  appVersion: z.string().min(1),
  // Public device identifier, sent the same way as deviceFingerprint —
  // confirmed production flow with the Android team (§22): required, not
  // optional, matching deviceFingerprint's treatment exactly.
  deviceCode: z.string().min(1),
});

const catalogQuerySchema = z.object({
  storeId: z.string().min(1),
  // Accepted but inert in v1 — delta sync is out of scope, `full` is
  // always true (docs/POS_SYNC_API.md §9).
  sinceVersion: z.coerce.number().int().min(0).optional(),
});

// v1 checksum semantics (docs/POS_SYNC_API.md §9/§10): opaque — a device
// compares checksums across fetches to detect torn downloads or identical
// content; it does not independently re-derive the hash (no
// canonicalization is specified yet). Postgres jsonb key-order
// normalization keeps this stable per stored row.
function checksumOf(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

// Mirrors docs/pos-sync/schemas/sale-event.schema.json. Item internals are
// loosely typed on purpose (§11: "product/variant reference, quantity,
// price at time of sale" — shape not pinned down further); productId/
// variantId/quantity are the only fields stock derivation reads.
const saleItemSchema = z
  .object({
    productId: z.string().min(1).optional(),
    variantId: z.string().min(1).optional(),
    quantity: z.number().optional(),
  })
  .passthrough();

const saleEventSchema = z.object({
  deviceId: z.string().min(1),
  storeId: z.string().min(1),
  localSaleId: z.string().min(1),
  localShiftId: z.string().min(1),
  eventType: z.enum([
    'SALE_CREATED',
    'SALE_PAID',
    'SALE_FISCALIZED',
    'SALE_COMPLETED',
    'SALE_CANCELLED',
    'SALE_REFUNDED',
    'SALE_FISCAL_UNKNOWN',
  ]),
  status: z.enum(['FISCALIZED', 'FISCAL_UNKNOWN', 'COMPLETED', 'CANCELLED', 'REFUNDED']),
  receiptNumber: z.number().int(),
  idempotencyKey: z.string().regex(/^[^:]+:sale:[^:]+:[A-Z_]+$/),
  occurredAt: z.string().min(1),
  items: z.array(saleItemSchema),
  payments: z.array(z.record(z.unknown())),
  totals: z.record(z.unknown()),
  fiscal: z.record(z.unknown()),
  print: z.record(z.unknown()),
  // POS Policy Engine integration (docs/POS_POLICY_ENGINE.md §8) —
  // required on every new request even though the underlying columns are
  // nullable for pre-existing rows (additive migration, no backfill).
  policiesVersion: z.number().int().nonnegative(),
  triggeredRuleIds: z.array(z.string()),
  // Shape not pinned down by §8/§12.2 yet — present only if a
  // REQUIRE_MANAGER rule was overridden, no fixed fields required.
  managerOverride: z.record(z.unknown()).optional(),
});

type SaleWarning = { index: number; code: string; message: string; productId?: string };

// Shared §5 semantics for every idempotent event endpoint: an identical
// replay gets the stored result back (same 201, same body, no side
// effects); the same key with a different payload is a client bug → 409.
// Branches on data, never on reply.send()'s return value.
function respondForExistingEvent(
  reply: FastifyReply,
  request: FastifyRequest,
  existing: { id: string; payloadHash: string; warnings: unknown },
  payloadHash: string
) {
  if (existing.payloadHash !== payloadHash) {
    return sendError(
      reply,
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'idempotencyKey was already used with a different payload',
      request
    );
  }
  return sendSuccess(reply, 201, { eventId: existing.id, warnings: existing.warnings }, request);
}

type StockApplication = { productId: string; variantId: string | null; delta: number };

// Stock reconciliation strategy (docs/SBGCLOUD_ARCHITECTURE.md §13 step 4):
// POS and the online store share one physical warehouse, so a derived
// StockLedgerEntry must also move the live stockQty the storefront reads —
// same atomic increment + StockMovement audit pattern already used by
// checkout/order/admin-adjust (see e.g. checkout.service.ts). No async
// reconciliation job: event ingestion is already idempotent (unique
// idempotencyKey), so "apply exactly once" holds by construction. The
// result is allowed to go negative — a POS sale reflects something that
// already happened at the till, possibly against a stale offline catalog
// (§9/§18); clamping to zero would hide a real oversell.
async function applyStockDelta(
  tx: any,
  input: StockApplication & {
    tenantId: string;
    reason: 'POS_SALE' | 'POS_ADJUSTMENT' | 'RESTOCK' | 'OTHER';
    sourceType: string;
    sourceId: string;
    note: string;
  }
) {
  const updated = input.variantId
    ? await tx.productVariant.update({
        where: { id: input.variantId },
        data: { stockQty: { increment: input.delta } },
        select: { stockQty: true },
      })
    : await tx.product.update({
        where: { id: input.productId },
        data: { stockQty: { increment: input.delta } },
        select: { stockQty: true },
      });
  const qtyAfter = updated.stockQty;
  const qtyBefore = qtyAfter - input.delta;

  await tx.stockLedgerEntry.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      variantId: input.variantId,
      delta: input.delta,
      reason: input.reason,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
  });
  await tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      variantId: input.variantId,
      delta: input.delta,
      qtyBefore,
      qtyAfter,
      note: input.note,
    },
  });
}

// Mirrors docs/pos-sync/schemas/stock-event.schema.json (§14) — non-sale
// stock movements only. POS_SALE is deliberately absent from the enum:
// sale-derived ledger rows come exclusively from sale events.
const stockEventSchema = z.object({
  deviceId: z.string().min(1),
  storeId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  delta: z.number().int(),
  reason: z.enum(['POS_ADJUSTMENT', 'RESTOCK', 'OTHER']),
  idempotencyKey: z.string().regex(/^[^:]+:stock:[^:]+:[A-Z_]+$/),
  occurredAt: z.string().min(1),
  note: z.string().optional(),
});

const heartbeatSchema = z.object({
  deviceId: z.string().min(1),
  localTime: z.string().min(1),
  appVersion: z.string().min(1),
  localCoreVersion: z.string().min(1),
  shiftState: z.enum(['CLOSED', 'OPEN', 'CLOSING', 'ERROR']),
  unsyncedEvents: z.number().int().min(0),
  fiscal: z.object({
    status: z.enum(['OK', 'WARNING', 'ERROR', 'UNKNOWN']),
    terminalId: z.string(),
    unsentCount: z.number().int().min(0),
    zRemaining: z.number().int().min(0),
  }),
  printer: z.object({ status: z.enum(['OK', 'ERROR', 'UNKNOWN']) }),
  network: z.object({ status: z.enum(['ONLINE', 'OFFLINE']) }),
});

// Fiscal/shift/commands v1 — the real SBG Lite POS Android contract
// (fiscal/shift/commands v1, 2026-07-04), snapshotted verbatim from a real
// LANDI M20SE terminal exchange, not the earlier speculative shape in
// docs/pos-sync/schemas/{fiscal,shift,cloud-command}.schema.json §12/§13
// (those docs are updated to match this implementation).
//
// RESOLVED (was an open question): the real doc's `X-Device-Code`
// header and this file's `Authorization: Bearer` are not alternatives —
// both are now required on every authenticated endpoint (including these
// three), via resolveAuthenticatedDevice() above. See §4/§22.
//
// rawDaemonResponse/rawFiscalPayload/rawShiftPayload are stored as-is
// (z.record(z.unknown())) — only the top-level envelope shape is
// validated, never their contents, since the source contract explicitly
// says these may expand without a contract change.
const fiscalEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.enum(['FISCAL_STARTED', 'FISCAL_SUCCESS', 'FISCAL_FAILED', 'FISCAL_UNKNOWN']),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  schemaVersion: z.number().int(),
  shiftNumber: z.number().int(),
  localReceiptId: z.string().min(1),
  daemonJournalId: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
  // The real contract sends receiptNumber/originalReceiptNumber/
  // fiscalReceiptNumber as either an Int (sale) or a String (refund) —
  // normalized to string for storage.
  receiptNumber: z.union([z.string(), z.number()]).nullable().optional(),
  receiptType: z.enum(['SALE', 'REFUND']).nullable().optional(),
  originalLocalReceiptId: z.string().nullable().optional(),
  originalReceiptNumber: z.union([z.string(), z.number()]).nullable().optional(),
  totalAmount: z.number(),
  currency: z.string().min(1),
  payments: z.array(z.record(z.unknown())),
  items: z.array(z.record(z.unknown())),
  createdAtMs: z.number(),
  fiscalizedAtMs: z.number().nullable().optional(),
  fiscalStatus: z.string().min(1),
  printStatus: z.string().min(1),
  fiscalReceiptNumber: z.union([z.string(), z.number()]).nullable().optional(),
  fiscalSign: z.string().nullable().optional(),
  fiscalQr: z.string().nullable().optional(),
  ofdStatus: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  rawDaemonResponse: z.record(z.unknown()),
  rawFiscalPayload: z.record(z.unknown()).nullable().optional(),
  // POS Policy Engine integration (docs/POS_POLICY_ENGINE.md §8) — same
  // required-at-API/nullable-at-storage split as saleEventSchema above.
  policiesVersion: z.number().int().nonnegative(),
  triggeredRuleIds: z.array(z.string()),
  managerOverride: z.record(z.unknown()).optional(),
});

const shiftEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.enum(['SHIFT_OPENED', 'SHIFT_CLOSED']),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  schemaVersion: z.number().int(),
  shiftNumber: z.number().int(),
  shiftState: z.string().min(1),
  openedAtMs: z.number().nullable().optional(),
  closedAtMs: z.number().nullable().optional(),
  zReportStatus: z.string().min(1),
  rawDaemonResponse: z.record(z.unknown()),
  rawShiftPayload: z.record(z.unknown()),
});

const commandAckSchema = z.object({
  status: z.enum(['DONE', 'FAILED', 'IGNORED', 'RETRY_LATER']),
  message: z.string().nullable().optional(),
  processedAtMs: z.number().optional(),
});

function toStringOrNull(value: string | number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

// Moderate baseline for device polling endpoints — generous enough that
// several devices behind one shop's shared IP won't trip it, but explicit
// rather than relying only on the global default (see app.ts rateLimit
// registration).
const POS_DEFAULT_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

export default async function posSyncRoutes(fastify: FastifyInstance) {
  // activationCode is short and typed in by hand at the till — without a
  // tight limit it's brute-forceable. 5/minute/IP, tighter than every other
  // endpoint here.
  fastify.post('/pos/v1/activate', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = activateSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid activation request', request, {
        issues: body.error.issues,
      });
    }

    const activation = await prisma.deviceActivation.findUnique({
      where: { activationCode: body.data.activationCode },
      include: { device: true },
    });
    if (!activation) {
      return sendError(reply, 404, 'INVALID_ACTIVATION_CODE', 'Invalid activation code', request);
    }

    if (activation.status === 'PENDING' && activation.expiresAt < new Date()) {
      await prisma.deviceActivation.update({ where: { id: activation.id }, data: { status: 'EXPIRED' } });
      return sendError(reply, 400, 'ACTIVATION_CODE_EXPIRED', 'Activation code has expired', request);
    }

    if (activation.status !== 'PENDING') {
      return sendError(
        reply,
        400,
        'ACTIVATION_CODE_ALREADY_USED',
        'Activation code already used or invalid',
        request
      );
    }

    // Anomaly signal only (docs/POS_SYNC_API.md §7) — this activation code
    // is being redeemed by a device fingerprint that already holds a
    // different active credential. Not blocked: the contract doesn't call
    // for rejection, just fleet-visibility flagging.
    const fingerprintCollision = await prisma.posDevice.findFirst({
      where: {
        deviceFingerprint: body.data.deviceFingerprint,
        status: 'ACTIVE',
        id: { not: activation.deviceId },
      },
      select: { id: true },
    });
    if (fingerprintCollision) {
      request.log.warn(
        { deviceFingerprint: body.data.deviceFingerprint, existingDeviceId: fingerprintCollision.id, deviceId: activation.deviceId },
        'pos-sync: activation code redeemed by a device fingerprint already tied to another active device'
      );
    }

    // Unlike deviceFingerprint above, deviceCode is security/money-sensitive
    // (it's half of the auth pair every other endpoint checks — §4/§22) —
    // a collision with a DIFFERENT active device in the same tenant is
    // blocked, not just logged. tenantId-scoped: two tenants may both use
    // a dev-style value like "POS-1" without conflict (matches the
    // @@unique([tenantId, deviceCode]) constraint).
    const deviceCodeCollision = await prisma.posDevice.findFirst({
      where: {
        tenantId: activation.device.tenantId,
        deviceCode: body.data.deviceCode,
        status: 'ACTIVE',
        id: { not: activation.deviceId },
      },
      select: { id: true, deviceCode: true },
    });
    if (deviceCodeCollision) {
      request.log.warn(
        { deviceCode: body.data.deviceCode, existingDeviceId: deviceCodeCollision.id, deviceId: activation.deviceId },
        'pos-sync: activation rejected — deviceCode already assigned to another active device in this tenant'
      );
      return sendError(
        reply,
        409,
        'DEVICE_CODE_ALREADY_IN_USE',
        'deviceCode is already assigned to another active device in this tenant',
        request
      );
    }

    const rawAccessToken = 'pos_' + randomBytes(32).toString('hex');
    const apiKeyHash = createHash('sha256').update(rawAccessToken).digest('hex');
    const apiKeyPrefix = rawAccessToken.slice(0, 12);

    const rawRefreshToken = 'posr_' + randomBytes(32).toString('hex');
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshTokenPrefix = rawRefreshToken.slice(0, 12);

    const now = new Date();
    let device;
    try {
      [device] = await prisma.$transaction([
        prisma.posDevice.update({
          where: { id: activation.deviceId },
          data: {
            status: 'ACTIVE',
            apiKeyHash,
            apiKeyPrefix,
            refreshTokenHash,
            refreshTokenPrefix,
            deviceFingerprint: body.data.deviceFingerprint,
            reportedDeviceName: body.data.deviceName,
            reportedDeviceType: body.data.deviceType,
            appVersion: body.data.appVersion,
            deviceCode: body.data.deviceCode,
          },
          select: { id: true, tenantId: true, storeId: true, deviceCode: true },
        }),
        prisma.deviceActivation.update({
          where: { id: activation.id },
          data: { status: 'CONFIRMED', confirmedAt: now },
        }),
        prisma.syncCursor.upsert({
          where: { deviceId: activation.deviceId },
          create: { deviceId: activation.deviceId, lastCatalogVersion: 0 },
          update: {},
        }),
      ]);
    } catch (err: any) {
      // Race-condition backstop for the pre-check above (@@unique([tenantId,
      // deviceCode]) is the real guarantee) — two concurrent activations
      // both passing the pre-check is unlikely but not impossible.
      if (err?.code === 'P2002') {
        return sendError(
          reply,
          409,
          'DEVICE_CODE_ALREADY_IN_USE',
          'deviceCode is already assigned to another active device in this tenant',
          request
        );
      }
      throw err;
    }

    const [latestSnapshot, storeSettings] = await Promise.all([
      prisma.catalogSnapshot.findFirst({
        where: { tenantId: device.tenantId, storeId: device.storeId },
        orderBy: { version: 'desc' },
        select: { version: true },
      }),
      prisma.posSettings.findUnique({
        where: { storeId: device.storeId },
        select: { version: true },
      }),
    ]);

    return sendSuccess(
      reply,
      201,
      {
        tenantId: device.tenantId,
        storeId: device.storeId,
        deviceId: device.id,
        accessToken: rawAccessToken,
        refreshToken: rawRefreshToken,
        // Canonical value actually persisted — echoed back so the device
        // knows the final value to send as X-Device-Code on every
        // subsequent call, in case Cloud ever normalizes it (§22).
        deviceCode: device.deviceCode,
        catalogVersion: latestSnapshot?.version ?? 0,
        // A store with no PosSettings row still serves defaults as
        // version 1 (see GET /settings below).
        settingsVersion: storeSettings?.version ?? 1,
      },
      request
    );
  });

  fastify.post('/pos/v1/heartbeat', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const body = heartbeatSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid heartbeat request', request, {
        issues: body.error.issues,
      });
    }

    // §8: Cloud derives device identity from the token, never the body —
    // a mismatching deviceId is a client bug, not a silent override.
    if (body.data.deviceId !== device.id) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'deviceId does not match the authenticated device',
        request
      );
    }

    // Fleet-visibility signal only, log-only (mirrors the fingerprint
    // anomaly check in /activate) — no admin endpoint reads per-device
    // shift/fiscal/printer/network state yet, so nothing is persisted here.
    if (body.data.fiscal.status === 'ERROR' || body.data.printer.status === 'ERROR') {
      request.log.warn(
        { deviceId: device.id, fiscal: body.data.fiscal, printer: body.data.printer },
        'pos-sync: heartbeat reported a degraded fiscal or printer status'
      );
    }

    const now = new Date();
    const [, tenant, latestSnapshot, storeSettings] = await Promise.all([
      // alertSentAt: null clears jobs/pos-device-monitor.ts's offline-alert
      // dedup flag the moment the device checks back in, so a device that
      // recovers and later drops offline again gets a fresh alert instead
      // of staying silenced by a stale timestamp from the previous outage.
      prisma.posDevice.update({ where: { id: device.id }, data: { lastSeenAt: now, alertSentAt: null } }),
      prisma.tenant.findUnique({
        where: { id: device.tenantId },
        select: { planExpiresAt: true, blockedAt: true },
      }),
      prisma.catalogSnapshot.findFirst({
        where: { tenantId: device.tenantId, storeId: device.storeId },
        orderBy: { version: 'desc' },
        select: { version: true },
      }),
      prisma.posSettings.findUnique({
        where: { storeId: device.storeId },
        select: { version: true },
      }),
    ]);

    return sendSuccess(
      reply,
      200,
      {
        serverTime: now.toISOString(),
        licenseStatus: getLicenseStatus(tenant ?? { planExpiresAt: null, blockedAt: null }),
        catalogVersion: latestSnapshot?.version ?? 0,
        settingsVersion: storeSettings?.version ?? 1,
        // Honest placeholder: no CloudCommand model yet
        // (docs/SBGCLOUD_ARCHITECTURE.md §12).
        hasCommands: false,
      },
      request
    );
  });

  fastify.get('/pos/v1/catalog/snapshot', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const query = catalogQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'storeId query parameter is required', request, {
        issues: query.error.issues,
      });
    }
    // §9: a device requesting another store's catalog is a validation
    // error, never a silent redirect to its own store.
    if (query.data.storeId !== device.storeId) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        "storeId does not match the authenticated device's store",
        request
      );
    }

    // sinceVersion is accepted but has no effect in v1 — delta sync is out
    // of scope (§9: `full` is always true), so the latest full snapshot is
    // always returned.
    const snapshot = await prisma.catalogSnapshot.findFirst({
      where: { tenantId: device.tenantId, storeId: device.storeId },
      orderBy: { version: 'desc' },
    });
    if (!snapshot) {
      return sendError(reply, 404, 'NO_SNAPSHOT_AVAILABLE', 'No catalog snapshot available yet', request);
    }

    await prisma.syncCursor.upsert({
      where: { deviceId: device.id },
      create: { deviceId: device.id, lastCatalogVersion: snapshot.version, lastSyncAt: new Date() },
      update: { lastCatalogVersion: snapshot.version, lastSyncAt: new Date() },
    });

    // Legacy snapshots (built before categories were added to the payload)
    // stored only { products } — serve missing arrays as empty rather than
    // failing or forcing a rebuild.
    const payload = (snapshot.payload ?? {}) as Record<string, unknown[]>;
    const body = {
      categories: payload.categories ?? [],
      products: payload.products ?? [],
      barcodes: payload.barcodes ?? [],
      uzProfiles: payload.uzProfiles ?? [],
    };

    return sendSuccess(
      reply,
      200,
      {
        version: snapshot.version,
        checksum: checksumOf(body),
        full: true,
        ...body,
      },
      request
    );
  });

  fastify.get('/pos/v1/settings', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    // docs/POS_POLICY_ENGINE.md §6 — this replaces the old single
    // { version, checksum, settings } shape with three independently
    // versioned blocks. Fetched in parallel: PosSettings (tenant-scoped,
    // may not exist yet), the global PlatformPolicyVersion counter, and
    // enabled PlatformPolicy rows (also global, never tenant-scoped).
    const [stored, platformPolicyVersion, platformPolicies, operators] = await Promise.all([
      prisma.posSettings.findUnique({
        where: { storeId: device.storeId },
        select: {
          version: true,
          payload: true,
          policiesVersion: true,
          tenantPolicyRules: true,
          printTemplatesVersion: true,
          printTemplates: true,
          staffVersion: true,
        },
      }),
      // Singleton by convention (see schema comment on the model) — a
      // fresh environment with no seed run yet has no row at all, which
      // is equivalent to version 1 (the model's own column default).
      prisma.platformPolicyVersion.findFirst({ select: { version: true } }),
      // §7 — a disabled rule is never sent to a till at all, so this is
      // filtered at the query, not in application code.
      prisma.platformPolicy.findMany({
        where: { enabled: true },
        select: { id: true, scope: true, severity: true, enabled: true, match: true, message: true, extra: true },
      }),
      // §14 — staff is optional: a store with no operators configured
      // sends `staff: null` (below) so the till knows to fall back to its
      // local roster, rather than an empty array meaning "no cashiers can
      // work here." Only active operators are ever sent to a till.
      prisma.posOperator.findMany({
        where: { tenantId: device.tenantId, storeId: device.storeId, active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, role: true, permissions: true, active: true },
      }),
    ]);

    // A store that has never configured POS settings still gets a valid,
    // parseable eight-key document (§10 of docs/POS_SYNC_API.md) — empty
    // defaults, version 1. Same convention for printTemplates (§6): empty
    // object, version 1, not an error.
    const settings = stored
      ? (stored.payload as Record<string, unknown>)
      : {
          taxProfile: {},
          paymentMethods: [],
          receiptTemplate: {},
          printerProfile: {},
          fiscalProfile: {},
          offlineLimits: {},
          roundingRules: {},
          featureFlags: {},
        };
    const printTemplates = stored ? (stored.printTemplates as Record<string, unknown>) : {};

    // §6 — storeTimezone lives at the top level of `settings`, a sibling
    // of taxProfile/paymentMethods/etc. Hardcoded to Asia/Tashkent for
    // now (single-country deployment); may become a per-store setting
    // later without changing this field's position in the contract.
    (settings as Record<string, unknown>).storeTimezone = 'Asia/Tashkent';

    // §7 — the wire Rule shape flattens `extra` onto the rule object
    // itself rather than nesting it; `source` is always server-assigned
    // from the table this row came from (PlatformPolicy has no `source`
    // column of its own — it doesn't need one, every row here IS a
    // platform rule).
    const platformRules = platformPolicies.map((row) => {
      const extra = row.extra && typeof row.extra === 'object' ? (row.extra as Record<string, unknown>) : {};
      return {
        ...extra,
        id: row.id,
        scope: row.scope,
        source: 'PLATFORM' as const,
        severity: row.severity,
        enabled: row.enabled,
        match: row.match,
        message: row.message,
      };
    });

    // §7 — tenantPolicyRules elements already arrive in wire Rule shape
    // (stored that way), so no field mapping is needed. But two things
    // still must happen server-side, not just be assumed from storage:
    // filtering out enabled:false (a disabled rule is never sent at all),
    // and — the important one — forcibly overwriting `source` to
    // 'TENANT' on every element, never trusting whatever value (if any)
    // is already embedded in the stored JSON. There is no admin UI
    // writing to tenantPolicyRules yet, so nothing can inject
    // source:'PLATFORM' into it today, but the column itself is an
    // unstructured JSON blob with no DB-level shape constraint. The day
    // an admin UI (or a bug, or a support script) writes an element
    // containing source:'PLATFORM', this line is the only thing standing
    // between that and a tenant successfully impersonating a platform
    // rule to a till. Do not remove this even though it looks redundant
    // against "well-behaved" data.
    const rawTenantRules = Array.isArray(stored?.tenantPolicyRules) ? (stored.tenantPolicyRules as unknown[]) : [];
    const tenantRules = rawTenantRules
      .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object')
      .filter((rule) => rule.enabled !== false)
      .map((rule) => ({ ...rule, source: 'TENANT' as const }));

    // §14 — wire Role is lowercase; PosOperatorRole is stored uppercase
    // (CASHIER/SENIOR_CASHIER/ADMIN). `staff: null` (not `[]`) when there
    // are no active operators, so Android can distinguish "this store has
    // no operators configured" from "the block isn't supported" and fall
    // back to its local roster.
    const staff = operators.length
      ? {
          operators: operators.map((op) => ({
            id: op.id,
            name: op.name,
            role: op.role.toLowerCase(),
            permissions: op.permissions,
            active: op.active,
          })),
        }
      : null;

    return sendSuccess(
      reply,
      200,
      {
        settingsVersion: stored?.version ?? 1,
        // §5 — a computed sum of two independently monotonic counters,
        // not a stored column; the till only needs to know *something*
        // in `policies` changed, not which side.
        policiesVersion: (platformPolicyVersion?.version ?? 1) + (stored?.policiesVersion ?? 1),
        printTemplatesVersion: stored?.printTemplatesVersion ?? 1,
        staffVersion: stored?.staffVersion ?? 1,
        settings,
        policies: { rules: [...platformRules, ...tenantRules] },
        printTemplates,
        staff,
      },
      request
    );
  });

  fastify.post('/pos/v1/sale-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const body = saleEventSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid sale event', request, {
        issues: body.error.issues,
      });
    }

    // Same rule as heartbeat (§8): identity comes from the token, never
    // the body — a mismatch is a client bug, not a silent override.
    if (body.data.deviceId !== device.id) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'deviceId does not match the authenticated device', request);
    }
    if (body.data.storeId !== device.storeId) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        "storeId does not match the authenticated device's store",
        request
      );
    }

    const payloadHash = checksumOf(body.data);

    const findExisting = () =>
      prisma.saleEvent.findUnique({
        where: { idempotencyKey: body.data.idempotencyKey },
        select: { id: true, payloadHash: true, warnings: true },
      });

    const existing = await findExisting();
    if (existing) return respondForExistingEvent(reply, request, existing, payloadHash);

    // §11: only SALE_COMPLETED with a completed/fiscalized status derives
    // stock. Refund/cancel stock effects are intentionally unspecified in
    // the contract — do not speculate here.
    const derivesStock =
      body.data.eventType === 'SALE_COMPLETED' &&
      (body.data.status === 'COMPLETED' || body.data.status === 'FISCALIZED');

    const warnings: SaleWarning[] = [];
    const applications: StockApplication[] = [];

    if (derivesStock) {
      const referencedIds = [...new Set(body.data.items.map((i) => i.productId).filter((id): id is string => !!id))];
      const known = referencedIds.length
        ? await prisma.product.findMany({
            where: { id: { in: referencedIds }, tenantId: device.tenantId },
            select: { id: true },
          })
        : [];
      const knownIds = new Set(known.map((p) => p.id));

      const referencedVariantIds = [
        ...new Set(body.data.items.map((i) => i.variantId).filter((id): id is string => !!id)),
      ];
      const knownVariants = referencedVariantIds.length
        ? await prisma.productVariant.findMany({
            where: { id: { in: referencedVariantIds } },
            select: { id: true, productId: true },
          })
        : [];
      const variantProductId = new Map(knownVariants.map((v) => [v.id, v.productId]));

      body.data.items.forEach((item, index) => {
        if (!item.productId) {
          warnings.push({
            index,
            code: 'MISSING_PRODUCT_REFERENCE',
            message: 'Line item has no productId — no stock ledger entry derived',
          });
          return;
        }
        if (!knownIds.has(item.productId)) {
          // §18: the sale already happened at the till — accept and store
          // it, flag the line item for reconciliation instead of rejecting.
          warnings.push({
            index,
            code: 'UNKNOWN_PRODUCT',
            message: 'productId is unknown to Cloud — no stock ledger entry derived',
            productId: item.productId,
          });
          return;
        }
        if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
          warnings.push({
            index,
            code: 'INVALID_QUANTITY',
            message: 'quantity must be a positive integer — no stock ledger entry derived',
            productId: item.productId,
          });
          return;
        }
        if (item.variantId && variantProductId.get(item.variantId) !== item.productId) {
          warnings.push({
            index,
            code: 'UNKNOWN_VARIANT',
            message: 'variantId does not belong to productId — no stock ledger entry derived',
            productId: item.productId,
          });
          return;
        }
        applications.push({
          productId: item.productId,
          variantId: item.variantId ?? null,
          delta: -item.quantity,
        });
      });
    }

    let event;
    try {
      event = await prisma.$transaction(async (tx) => {
        const created = await tx.saleEvent.create({
          data: {
            tenantId: device.tenantId,
            storeId: device.storeId,
            deviceId: device.id,
            localSaleId: body.data.localSaleId,
            localShiftId: body.data.localShiftId,
            eventType: body.data.eventType,
            status: body.data.status,
            receiptNumber: body.data.receiptNumber,
            idempotencyKey: body.data.idempotencyKey,
            payloadHash,
            occurredAt: new Date(body.data.occurredAt),
            payload: {
              items: body.data.items,
              payments: body.data.payments,
              totals: body.data.totals,
              fiscal: body.data.fiscal,
              print: body.data.print,
            } as any,
            warnings: warnings as any,
            // Accept-don't-reject (docs/POS_SYNC_API.md §18): stored as
            // the till reported it, no validation against real
            // PlatformPolicy/tenantPolicyRules content.
            policiesVersion: body.data.policiesVersion,
            triggeredRuleIds: body.data.triggeredRuleIds,
            managerOverride: (body.data.managerOverride ?? null) as any,
          },
          select: { id: true },
        });
        for (const app of applications) {
          await applyStockDelta(tx, {
            tenantId: device.tenantId,
            ...app,
            reason: 'POS_SALE',
            sourceType: 'SaleEvent',
            sourceId: created.id,
            note: `POS sale ${body.data.localSaleId}`,
          });
        }
        return created;
      });
    } catch (err: any) {
      // Concurrent duplicate lost the unique-idempotencyKey race — resolve
      // it exactly like a replay that arrived a moment later.
      if (err?.code === 'P2002') {
        const winner = await findExisting();
        if (winner) return respondForExistingEvent(reply, request, winner, payloadHash);
      }
      throw err;
    }

    return sendSuccess(reply, 201, { eventId: event.id, warnings }, request);
  });

  fastify.post('/pos/v1/stock-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const body = stockEventSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid stock event', request, {
        issues: body.error.issues,
      });
    }

    if (body.data.deviceId !== device.id) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'deviceId does not match the authenticated device', request);
    }
    if (body.data.storeId !== device.storeId) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        "storeId does not match the authenticated device's store",
        request
      );
    }

    const payloadHash = checksumOf(body.data);

    const findExisting = () =>
      prisma.stockEvent.findUnique({
        where: { idempotencyKey: body.data.idempotencyKey },
        select: { id: true, payloadHash: true, warnings: true },
      });

    const existing = await findExisting();
    if (existing) return respondForExistingEvent(reply, request, existing, payloadHash);

    // §18 accept-don't-reject: the correction already happened at the
    // till. An unknown product/variant keeps the event (stored below) but
    // derives no ledger row / stockQty change.
    const product = await prisma.product.findFirst({
      where: { id: body.data.productId, tenantId: device.tenantId },
      select: { id: true },
    });
    const variant = product && body.data.variantId
      ? await prisma.productVariant.findUnique({
          where: { id: body.data.variantId },
          select: { id: true, productId: true },
        })
      : null;
    const variantMismatch = product && body.data.variantId && variant?.productId !== body.data.productId;
    const applies = product && !variantMismatch;

    const warnings: SaleWarning[] = [];
    // index kept for shape-consistency with sale-event warnings — a
    // stock event always has exactly one item.
    if (!product) {
      warnings.push({
        index: 0,
        code: 'UNKNOWN_PRODUCT',
        message: 'productId is unknown to Cloud — no stock ledger entry derived',
        productId: body.data.productId,
      });
    } else if (variantMismatch) {
      warnings.push({
        index: 0,
        code: 'UNKNOWN_VARIANT',
        message: 'variantId does not belong to productId — no stock ledger entry derived',
        productId: body.data.productId,
      });
    }

    let event;
    try {
      event = await prisma.$transaction(async (tx) => {
        const created = await tx.stockEvent.create({
          data: {
            tenantId: device.tenantId,
            storeId: device.storeId,
            deviceId: device.id,
            productId: body.data.productId,
            variantId: body.data.variantId ?? null,
            delta: body.data.delta,
            reason: body.data.reason,
            idempotencyKey: body.data.idempotencyKey,
            payloadHash,
            occurredAt: new Date(body.data.occurredAt),
            note: body.data.note ?? null,
            warnings: warnings as any,
          },
          select: { id: true },
        });
        if (applies) {
          await applyStockDelta(tx, {
            tenantId: device.tenantId,
            productId: body.data.productId,
            variantId: body.data.variantId ?? null,
            delta: body.data.delta,
            reason: body.data.reason,
            sourceType: 'StockEvent',
            sourceId: created.id,
            note: body.data.note ?? `POS ${body.data.reason.toLowerCase()}`,
          });
        }
        return created;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const winner = await findExisting();
        if (winner) return respondForExistingEvent(reply, request, winner, payloadHash);
      }
      throw err;
    }

    return sendSuccess(reply, 201, { eventId: event.id, warnings }, request);
  });

  fastify.post('/pos/v1/fiscal-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const body = fiscalEventSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid fiscal event', request, {
        issues: body.error.issues,
      });
    }

    const payloadHash = checksumOf(body.data);
    try {
      await prisma.fiscalEvent.create({
        data: {
          tenantId: device.tenantId,
          storeId: device.storeId,
          deviceId: device.id,
          eventId: body.data.eventId,
          eventType: body.data.eventType,
          aggregateType: body.data.aggregateType,
          aggregateId: body.data.aggregateId,
          idempotencyKey: body.data.idempotencyKey,
          schemaVersion: body.data.schemaVersion,
          shiftNumber: body.data.shiftNumber,
          localReceiptId: body.data.localReceiptId,
          daemonJournalId: body.data.daemonJournalId ?? null,
          receiptNumber: toStringOrNull(body.data.receiptNumber),
          receiptType: body.data.receiptType ?? null,
          originalLocalReceiptId: body.data.originalLocalReceiptId ?? null,
          originalReceiptNumber: toStringOrNull(body.data.originalReceiptNumber),
          totalAmount: body.data.totalAmount,
          currency: body.data.currency,
          payments: body.data.payments as any,
          items: body.data.items as any,
          createdAtMs: new Date(body.data.createdAtMs),
          fiscalizedAtMs: body.data.fiscalizedAtMs != null ? new Date(body.data.fiscalizedAtMs) : null,
          fiscalStatus: body.data.fiscalStatus,
          printStatus: body.data.printStatus,
          fiscalReceiptNumber: toStringOrNull(body.data.fiscalReceiptNumber),
          fiscalSign: body.data.fiscalSign ?? null,
          fiscalQr: body.data.fiscalQr ?? null,
          ofdStatus: body.data.ofdStatus ?? null,
          errorCode: body.data.errorCode ?? null,
          errorMessage: body.data.errorMessage ?? null,
          rawDaemonResponse: body.data.rawDaemonResponse as any,
          rawFiscalPayload: (body.data.rawFiscalPayload ?? null) as any,
          payloadHash,
          // Accept-don't-reject (docs/POS_SYNC_API.md §18): stored as the
          // till reported it, no validation against real PlatformPolicy/
          // tenantPolicyRules content.
          policiesVersion: body.data.policiesVersion,
          triggeredRuleIds: body.data.triggeredRuleIds,
          managerOverride: (body.data.managerOverride ?? null) as any,
        },
      });
    } catch (err: any) {
      // §5-equivalent idempotency: eventId is the sole delivery-uniqueness
      // key per the source contract — a retry of the exact same delivery
      // hits the (deviceId, eventId) unique constraint. No 409 here: the
      // source contract doesn't define a conflict response for this pair
      // of endpoints, and a device only ever retries with the same body
      // (durable outbox, §7), so silently no-op-ing the duplicate is safe.
      if (err?.code === 'P2002') {
        return sendAck(reply, 200, request);
      }
      throw err;
    }

    return sendAck(reply, 201, request);
  });

  fastify.post('/pos/v1/shift-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const body = shiftEventSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid shift event', request, {
        issues: body.error.issues,
      });
    }

    const payloadHash = checksumOf(body.data);
    try {
      await prisma.shiftEvent.create({
        data: {
          tenantId: device.tenantId,
          storeId: device.storeId,
          deviceId: device.id,
          eventId: body.data.eventId,
          eventType: body.data.eventType,
          aggregateType: body.data.aggregateType,
          aggregateId: body.data.aggregateId,
          idempotencyKey: body.data.idempotencyKey,
          schemaVersion: body.data.schemaVersion,
          shiftNumber: body.data.shiftNumber,
          shiftState: body.data.shiftState,
          openedAtMs: body.data.openedAtMs != null ? new Date(body.data.openedAtMs) : null,
          closedAtMs: body.data.closedAtMs != null ? new Date(body.data.closedAtMs) : null,
          zReportStatus: body.data.zReportStatus,
          rawDaemonResponse: body.data.rawDaemonResponse as any,
          rawShiftPayload: body.data.rawShiftPayload as any,
          payloadHash,
        },
      });
    } catch (err: any) {
      // Same eventId-keyed idempotent-replay handling as fiscal-events.
      if (err?.code === 'P2002') {
        return sendAck(reply, 200, request);
      }
      throw err;
    }

    return sendAck(reply, 201, request);
  });

  // Response shape here is the real contract's literal
  // { success: true, commands: [...] } — deliberately NOT the general
  // envelope (no `data` wrapper, no `requestId`) to match what the real
  // Android client parses byte-for-byte (docs/POS_SYNC_API.md §15).
  fastify.get('/pos/v1/commands', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const pending = await prisma.cloudCommand.findMany({
      where: { deviceId: device.id, tenantId: device.tenantId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, payload: true, createdAt: true },
    });

    return reply.status(200).send({
      success: true,
      commands: pending.map((c) => ({
        id: c.id,
        type: c.type,
        payload: c.payload,
        createdAtMs: c.createdAt.getTime(),
      })),
    });
  });

  fastify.post('/pos/v1/commands/:id/ack', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const body = commandAckSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid command ack', request, {
        issues: body.error.issues,
      });
    }

    const { id } = request.params as { id: string };
    // Tenant/device isolation: a device may only ack its own command — a
    // command that exists but belongs to a different device must not leak
    // as "found", so this is 404, not 403.
    const command = await prisma.cloudCommand.findFirst({
      where: { id, deviceId: device.id, tenantId: device.tenantId },
      select: { id: true },
    });
    if (!command) {
      return sendError(reply, 404, 'COMMAND_NOT_FOUND', 'No such command for this device', request);
    }

    await prisma.cloudCommand.update({
      where: { id: command.id },
      data: {
        status: 'ACKED',
        ackedAt: new Date(),
        ackStatus: body.data.status,
        ackMessage: body.data.message ?? null,
      },
    });

    return sendAck(reply, 200, request);
  });
}
