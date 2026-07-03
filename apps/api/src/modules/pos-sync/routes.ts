import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { getLicenseStatus } from '../../lib/billing.js';
import { resolveDevice } from './device-auth.js';
import { sendError, sendSuccess } from './envelope.js';

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

const activateSchema = z.object({
  activationCode: z.string().min(1),
  deviceFingerprint: z.string().min(1),
  deviceName: z.string().min(1),
  deviceType: z.enum(['WINDOWS', 'ANDROID', 'LANDI', 'WEB']),
  appVersion: z.string().min(1),
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

    const rawAccessToken = 'pos_' + randomBytes(32).toString('hex');
    const apiKeyHash = createHash('sha256').update(rawAccessToken).digest('hex');
    const apiKeyPrefix = rawAccessToken.slice(0, 12);

    const rawRefreshToken = 'posr_' + randomBytes(32).toString('hex');
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshTokenPrefix = rawRefreshToken.slice(0, 12);

    const now = new Date();
    const [device] = await prisma.$transaction([
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
        },
        select: { id: true, tenantId: true, storeId: true },
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
        catalogVersion: latestSnapshot?.version ?? 0,
        // A store with no PosSettings row still serves defaults as
        // version 1 (see GET /settings below).
        settingsVersion: storeSettings?.version ?? 1,
      },
      request
    );
  });

  fastify.post('/pos/v1/heartbeat', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveDevice(request.headers.authorization);
    if (!device) return unauthorized(reply, request);

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
      prisma.posDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } }),
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
    const device = await resolveDevice(request.headers.authorization);
    if (!device) return unauthorized(reply, request);

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
    const device = await resolveDevice(request.headers.authorization);
    if (!device) return unauthorized(reply, request);

    const stored = await prisma.posSettings.findUnique({
      where: { storeId: device.storeId },
      select: { version: true, payload: true },
    });

    // A store that has never configured POS settings still gets a valid,
    // parseable eight-key document (§10) — empty defaults, version 1.
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

    return sendSuccess(
      reply,
      200,
      {
        version: stored?.version ?? 1,
        checksum: checksumOf(settings),
        settings,
      },
      request
    );
  });

  fastify.post('/pos/v1/sale-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveDevice(request.headers.authorization);
    if (!device) return unauthorized(reply, request);

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
    const device = await resolveDevice(request.headers.authorization);
    if (!device) return unauthorized(reply, request);

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

  fastify.post('/pos/v1/fiscal-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (_request, reply) => {
    return notImplemented(reply, 'fiscal event ingestion');
  });

  fastify.post('/pos/v1/shift-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (_request, reply) => {
    return notImplemented(reply, 'shift event ingestion');
  });

  fastify.get('/pos/v1/commands', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (_request, reply) => {
    return notImplemented(reply, 'cloud command polling');
  });

  fastify.post('/pos/v1/commands/:id/ack', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (_request, reply) => {
    return notImplemented(reply, 'cloud command acknowledgement');
  });
}
