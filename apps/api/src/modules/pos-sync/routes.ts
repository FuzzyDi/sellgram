import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { getLicenseStatus } from '../../lib/billing.js';
import { generateLoyaltyCardNumber } from '../../lib/loyalty-card.js';
import { DEFAULT_TIERS, computeTier } from '../loyalty/routes.js';
import { fetchProductTypesById, deriveProductTypeFields } from './product-type-rules.js';
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

const productSearchQuerySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// docs/CUSTOMER_LOYALTY.md §5 — both optional at the schema level; the
// "at least one of the two" requirement is enforced in the handler
// (matching a 400 VALIDATION_ERROR body, not a Zod .refine() message).
const customerLookupQuerySchema = z.object({
  phone: z.string().min(1).optional(),
  loyaltyCard: z.string().min(1).optional(),
});

// docs/CUSTOMER_LOYALTY.md §5/§10/§13 step 2.
const createPosCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
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
  // docs/CUSTOMER_LOYALTY.md §7/§13 step 3 — nullable, anonymous sale
  // stays valid with no customerId at all. This field MUST exist here —
  // z.object() silently strips any key it doesn't declare (no
  // .passthrough() on this schema), the exact class of bug
  // docs/PRODUCT_TYPES.md §5 already caught once for weightBarcode.
  customerId: z.string().min(1).optional(),
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
  // docs/CUSTOMER_LOYALTY.md §7 (revised) — loyalty accrual's identity
  // source, moved here from SaleEvent. This field MUST exist here —
  // z.object() silently strips any key it doesn't declare (no
  // .passthrough() on this schema), same class of bug docs/PRODUCT_TYPES
  // .md §5 already caught once for weightBarcode. Same
  // min(1).optional() shape as saleEventSchema's customerId above, for
  // consistency — an empty-string id is as meaningless here as there.
  customerId: z.string().min(1).optional(),
  // docs/POS_POLICY_ENGINE.md §14.1 — which cashier rang up this receipt.
  // Same "must be declared or z.object() silently strips it" reasoning as
  // customerId just above (both sides — Zod schema and Prisma create —
  // land in the same PR, per the CUSTOMER_LOYALTY.md §7 lesson).
  // operatorName/operatorRole are the till's own snapshot of the
  // operator's name/role at the moment of the sale, not re-derived from
  // PosOperator server-side.
  operatorId: z.string().min(1).optional(),
  operatorName: z.string().optional(),
  operatorRole: z.string().optional(),
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

// docs/POS_SYNC_API.md §24 — operator audit trail.
const operatorEventSchema = z.object({
  eventType: z.enum([
    'OPERATOR_LOCK',
    'OPERATOR_LOGIN',
    'OPERATOR_SWITCH',
    'OPERATOR_PIN_FAILED',
    'OPERATOR_PIN_BLOCKED',
  ]),
  // No @relation on the Prisma side (schema comment on
  // PosOperatorEvent) — accept-don't-reject (§18) means an unrecognized
  // id is still stored, not rejected. operatorId is nullable at the
  // schema level for OPERATOR_LOCK specifically (nobody was logged in
  // when the till locked); actorId is who *caused* the event (the
  // outgoing operator for a SWITCH, for example).
  operatorId: z.string().min(1).nullable().optional(),
  actorId: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().regex(/^[^:]+:operator:[^:]+:[A-Z_]+$/),
  // Device-reported event time (ms since epoch) — same numeric-ms
  // convention as this file's other *AtMs fields (createdAtMs/
  // fiscalizedAtMs/openedAtMs). Deliberately NOT written to this row's
  // own `createdAt` column (that stays Cloud's own, non-spoofable
  // receipt timestamp, @default(now()) — see the route handler); folded
  // into `payload` instead so it isn't lost, and isn't silently
  // stripped either (the weightBarcode/SaleEvent.customerId class of
  // mistake this codebase has hit twice already).
  createdAt: z.number(),
  payload: z.record(z.unknown()).optional(),
});

// docs/POS_SYNC_API.md §25/§25.3 — universal payment-provider event
// stream. eventType vocabulary confirmed with the Android team
// 2026-07-17 (§25.3) — all eleven values are PAYMENT_-prefixed,
// including PAYMENT_PROVIDER_REJECTED_CONFIRMED and
// PAYMENT_RECOVERY_FAILED_RETRYABLE, which an earlier, unconfirmed
// reading of a compressed shorthand list had gotten wrong (missing the
// PAYMENT_ prefix on those two only) — fixed here to match the
// confirmed contract.
const paymentEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.enum([
    'PAYMENT_INITIATED',
    'PAYMENT_PENDING',
    'PAYMENT_CONFIRMED',
    'PAYMENT_REJECTED',
    'PAYMENT_CANCELLED',
    'PAYMENT_AMBIGUOUS',
    'PAYMENT_REFUND_INITIATED',
    'PAYMENT_REFUND_CONFIRMED',
    'PAYMENT_REFUND_REJECTED',
    'PAYMENT_PROVIDER_REJECTED_CONFIRMED',
    'PAYMENT_RECOVERY_FAILED_RETRYABLE',
  ]),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  schemaVersion: z.number().int(),
  idempotencyKey: z.string().min(1),
  provider: z.string().min(1),
  paymentMethod: z.string().min(1),
  operation: z.string().min(1),
  status: z.string().min(1),
  amount: z.number().int(),
  currency: z.string().min(1).optional(),
  providerPaymentId: z.string().nullable().optional(),
  providerInvoiceId: z.string().nullable().optional(),
  providerRefundId: z.string().nullable().optional(),
  saleId: z.string().nullable().optional(),
  refundId: z.string().nullable().optional(),
  fiscalReceiptId: z.string().nullable().optional(),
  terminalId: z.string().nullable().optional(),
  shiftId: z.number().int().nullable().optional(),
  // Till's own snapshot of who was operating it — same reasoning as
  // FiscalEvent.operatorName/operatorRole (docs/POS_POLICY_ENGINE.md
  // §14.1): not re-derived from PosOperator server-side.
  cashierId: z.string().nullable().optional(),
  cashierName: z.string().nullable().optional(),
  cashierRole: z.string().nullable().optional(),
  // Numeric ms, same convention as this file's other *AtMs fields.
  createdAtMs: z.number().nullable().optional(),
  updatedAtMs: z.number().nullable().optional(),
  completedAtMs: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
  rawProviderStatus: z.record(z.unknown()).nullable().optional(),
});

const commandAckSchema = z.object({
  status: z.enum(['DONE', 'FAILED', 'IGNORED', 'RETRY_LATER']),
  message: z.string().nullable().optional(),
  processedAtMs: z.number().optional(),
});

function toStringOrNull(value: string | number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

type FiscalLoyaltySource = {
  id: string;
  deviceId: string;
  eventType: string;
  receiptType: string | null;
  fiscalStatus: string;
  customerId: string | null;
  totalAmount: number;
  receiptNumber: string | null;
  originalLocalReceiptId: string | null;
  originalReceiptNumber: string | null;
};

// docs/CUSTOMER_LOYALTY.md §7 (revised) — POS loyalty accrual, now keyed
// off a FISCAL_SUCCESS fiscal event rather than a SALE_COMPLETED sale
// event (see the fiscal-events handler's comment for why). Reuses
// order.service.ts's accrual math verbatim (tier lookup, unitAmount/
// pointsPerUnit, the "only touch totalSpent/ordersCount when
// pointsEarned > 0" quirk) — not a place to silently diverge from it.
// Called from a try/catch at the call site; this function itself does
// not swallow errors — a caller relying on it to also handle its own
// failures would be a bug.
async function accrueFiscalLoyalty(fiscalEvent: FiscalLoyaltySource, tenantId: string): Promise<void> {
  if (
    fiscalEvent.eventType !== 'FISCAL_SUCCESS' ||
    fiscalEvent.receiptType !== 'SALE' ||
    fiscalEvent.fiscalStatus !== 'SUCCESS' ||
    !fiscalEvent.customerId
  ) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Idempotency: guards both a genuine duplicate FISCAL_SUCCESS row for
    // the same receipt and the P2002-replay path in the route handler
    // (which re-runs this function against the same already-accrued row
    // after a crash between the original create and its accrual step).
    const alreadyAccrued = await tx.loyaltyTransaction.findFirst({
      where: { sourceType: 'POS_FISCAL', sourceId: fiscalEvent.id },
      select: { id: true },
    });
    if (alreadyAccrued) return;

    const loyaltyConfig = await tx.loyaltyConfig.findUnique({ where: { tenantId } });
    if (!loyaltyConfig?.isEnabled) return;

    // Tiyin → UZS (docs/CUSTOMER_LOYALTY.md §7) — unlike sale-events'
    // opaque totals.total, FiscalEvent.totalAmount is a real, typed Int
    // column, no defensive extraction needed.
    const total = fiscalEvent.totalAmount / 100;
    if (!(total > 0)) return;

    const customer = await tx.customer.findFirst({
      where: { id: fiscalEvent.customerId!, tenantId },
      select: { id: true, totalSpent: true, loyaltyPoints: true },
    });
    if (!customer) return;

    const tiers = (loyaltyConfig.tiers as any) ?? DEFAULT_TIERS;
    const tier = computeTier(Number(customer.totalSpent), tiers);
    const basePoints = Math.floor(total / loyaltyConfig.unitAmount) * loyaltyConfig.pointsPerUnit;
    const pointsEarned = Math.floor(basePoints * tier.multiplier);
    if (pointsEarned <= 0) return;

    const updatedCustomer = await tx.customer.update({
      where: { id: customer.id },
      data: {
        loyaltyPoints: { increment: pointsEarned },
        totalSpent: { increment: total },
        ordersCount: { increment: 1 },
      },
      select: { loyaltyPoints: true },
    });
    await tx.loyaltyTransaction.create({
      data: {
        customerId: customer.id,
        tenantId,
        type: 'EARN',
        points: pointsEarned,
        balanceAfter: updatedCustomer.loyaltyPoints,
        sourceType: 'POS_FISCAL',
        sourceId: fiscalEvent.id,
        description: `Loyalty points earned (${tier.name}) for POS receipt #${fiscalEvent.receiptNumber ?? '?'}`,
      },
    });
  });
}

// Android may not always send customerId on a REFUND event (the
// cashier didn't re-scan a card for a return) — fall back to the
// original SALE receipt's customerId via originalLocalReceiptId/
// originalReceiptNumber, both of which the device already sends for a
// refund (docs/POS_SYNC_API.md fiscal-events contract). Scoped to the
// same device: the (deviceId, localReceiptId)/(deviceId, receiptNumber)
// indexes on FiscalEvent (schema.prisma) exist for exactly this lookup.
// localReceiptId is preferred when present — it's the more precise,
// deterministic key; receiptNumber is the fallback for a refund that
// only carries the fiscal receipt number.
async function resolveCustomerIdForRefund(
  fiscalEvent: Pick<FiscalLoyaltySource, 'deviceId' | 'originalLocalReceiptId' | 'originalReceiptNumber'>
): Promise<string | null> {
  if (fiscalEvent.originalLocalReceiptId) {
    const original = await prisma.fiscalEvent.findFirst({
      where: {
        deviceId: fiscalEvent.deviceId,
        receiptType: 'SALE',
        eventType: 'FISCAL_SUCCESS',
        localReceiptId: fiscalEvent.originalLocalReceiptId,
      },
      orderBy: { createdAt: 'desc' },
      select: { customerId: true },
    });
    if (original?.customerId) return original.customerId;
  }
  if (fiscalEvent.originalReceiptNumber) {
    const original = await prisma.fiscalEvent.findFirst({
      where: {
        deviceId: fiscalEvent.deviceId,
        receiptType: 'SALE',
        eventType: 'FISCAL_SUCCESS',
        receiptNumber: fiscalEvent.originalReceiptNumber,
      },
      orderBy: { createdAt: 'desc' },
      select: { customerId: true },
    });
    if (original?.customerId) return original.customerId;
  }
  return null;
}

// docs/CUSTOMER_LOYALTY.md §7 — reverses the loyalty points a refunded
// sale's original purchase would have earned. Sibling to
// accrueFiscalLoyalty above, same call-site try/catch, same
// "customerId must exist" and "loyalty must be enabled" gates — the one
// structural difference is customerId can come from the refund event
// itself OR, if absent, from the original sale via
// resolveCustomerIdForRefund.
//
// Deliberately uses the same *base* formula as accrual
// (floor(total/unitAmount)*pointsPerUnit) WITHOUT the tier multiplier —
// this is the literal formula given for this reversal, not an
// oversight: the customer's tier at refund time can differ from their
// tier when the sale was originally rung up (totalSpent has likely
// moved since), so re-deriving "what tier-adjusted amount was earned
// back then" isn't something this function attempts. A more precise
// alternative — looking up the original POS_FISCAL LoyaltyTransaction's
// actual `points` value by sourceId — is not implemented here since it
// wasn't asked for; flagged as a known limitation, not silently fixed.
async function reverseFiscalLoyaltyForRefund(fiscalEvent: FiscalLoyaltySource, tenantId: string): Promise<void> {
  if (
    fiscalEvent.eventType !== 'FISCAL_SUCCESS' ||
    fiscalEvent.receiptType !== 'REFUND' ||
    fiscalEvent.fiscalStatus !== 'SUCCESS'
  ) {
    return;
  }

  const customerId = fiscalEvent.customerId ?? (await resolveCustomerIdForRefund(fiscalEvent));
  if (!customerId) return;

  await prisma.$transaction(async (tx) => {
    // Idempotency — same sourceId-per-event pattern as accrual, distinct
    // sourceType so an EARN row for a sale and an ADJUST row for its
    // refund (different fiscalEvent.id each) never collide, and this
    // check can never mistake "already accrued" for "already reversed".
    const alreadyReversed = await tx.loyaltyTransaction.findFirst({
      where: { sourceType: 'POS_FISCAL_REFUND', sourceId: fiscalEvent.id },
      select: { id: true },
    });
    if (alreadyReversed) return;

    const loyaltyConfig = await tx.loyaltyConfig.findUnique({ where: { tenantId } });
    if (!loyaltyConfig?.isEnabled) return;

    const total = fiscalEvent.totalAmount / 100;
    if (!(total > 0)) return;

    // Only loyaltyPoints is reversed here — totalSpent/ordersCount (both
    // incremented by accrueFiscalLoyalty) are deliberately left alone,
    // matching the literal scope of this task ("сторнирование баллов
    // лояльности"). A refunded sale therefore still counts toward tier
    // progression permanently — a known asymmetry with the accrual side,
    // not something this function silently corrects.
    const customer = await tx.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true, loyaltyPoints: true },
    });
    if (!customer) return;

    const basePoints = Math.floor(total / loyaltyConfig.unitAmount) * loyaltyConfig.pointsPerUnit;
    if (basePoints <= 0) return;

    // Never go negative — clamp the deduction to whatever balance the
    // customer actually has left, rather than letting a refund on a
    // since-spent balance push loyaltyPoints below zero.
    const pointsToDeduct = Math.min(basePoints, customer.loyaltyPoints);
    if (pointsToDeduct <= 0) return;

    const updatedCustomer = await tx.customer.update({
      where: { id: customer.id },
      data: { loyaltyPoints: { decrement: pointsToDeduct } },
      select: { loyaltyPoints: true },
    });
    await tx.loyaltyTransaction.create({
      data: {
        customerId: customer.id,
        tenantId,
        type: 'ADJUST',
        points: -pointsToDeduct,
        balanceAfter: updatedCustomer.loyaltyPoints,
        sourceType: 'POS_FISCAL_REFUND',
        sourceId: fiscalEvent.id,
        description: `Loyalty points reversed for POS refund #${fiscalEvent.receiptNumber ?? '?'}`,
      },
    });
  });
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
    const [, tenant, latestSnapshot, storeSettings, pendingCommandsCount] = await Promise.all([
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
      // docs/POS_SYNC_API.md §8/§15 — CloudCommand now exists (§15's
      // GET /commands + POST /commands/:id/ack), so hasCommands/
      // pendingCommandsCount are real counts, not the hardcoded-false
      // placeholder this used to be.
      prisma.cloudCommand.count({ where: { deviceId: device.id, status: 'PENDING' } }),
    ]);

    return sendSuccess(
      reply,
      200,
      {
        serverTime: now.toISOString(),
        licenseStatus: getLicenseStatus(tenant ?? { planExpiresAt: null, blockedAt: null }),
        catalogVersion: latestSnapshot?.version ?? 0,
        settingsVersion: storeSettings?.version ?? 1,
        // §8 — a hint to poll GET /commands soon, not a push and not a
        // guarantee (a stale false must never be read as "definitely no
        // commands").
        hasCommands: pendingCommandsCount > 0,
        pendingCommandsCount,
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

  // On-demand product search for the till — a cashier typing a partial
  // name/SKU/ИКПУ code or scanning a barcode the local catalog snapshot
  // doesn't resolve. Same device auth as every other /pos/v1/* route;
  // same per-product shape as CatalogSnapshot's products[] (§9) —
  // deliberately identical field-for-field (built from the same select +
  // product-type-rules.ts helpers as admin-routes.ts's snapshot builder)
  // so a till can reuse one product-rendering code path regardless of
  // whether a row came from the snapshot or from this endpoint.
  fastify.get('/pos/v1/products/search', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const query = productSearchQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid search query', request, {
        issues: query.error.issues,
      });
    }
    const { q, limit } = query.data;

    const products = await prisma.product.findMany({
      where: {
        tenantId: device.tenantId,
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { mxikCode: { contains: q, mode: 'insensitive' } },
          // Exact match, not ILIKE — a scanned barcode is either the
          // right one or it isn't, unlike a typed name/SKU fragment.
          { barcodes: { some: { tenantId: device.tenantId, barcode: q } } },
        ],
      },
      take: limit,
      orderBy: { name: 'asc' },
      // Field-for-field identical to admin-routes.ts's CatalogSnapshot
      // product select — see that handler's comments for why each field
      // is here (VAT/marking, weighted-goods, barcodes/variants).
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        currency: true,
        stockQty: true,
        categoryId: true,
        vatRate: true,
        vatExempt: true,
        markType: true,
        isMarked: true,
        mxikCode: true,
        packageCode: true,
        unit: true,
        isByWeight: true,
        isWeightedPiece: true,
        pluCode: true,
        pricePerKg: true,
        updatedAt: true,
        barcodes: {
          select: { id: true, barcode: true, type: true, isDefault: true, unitQty: true, variantId: true },
        },
        variants: {
          where: { isActive: true },
          select: { id: true, name: true, sku: true, price: true, stockQty: true },
        },
        productTypeId: true,
        productType: {
          select: { code: true, rules: true, weightMode: true, barcodePrefixes: true, parentTypeId: true },
        },
      },
    });

    const typesById = await fetchProductTypesById();
    const results = products.map(({ productType, ...product }) => ({
      ...product,
      ...deriveProductTypeFields(product, productType, typesById),
    }));

    // Same "unconfigured store" convention as GET /pos/v1/settings (§6)
    // — no snapshot yet is 0, not an error; the search results
    // themselves are still perfectly usable without one.
    const lastSnapshot = await prisma.catalogSnapshot.findFirst({
      where: { tenantId: device.tenantId, storeId: device.storeId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return sendSuccess(
      reply,
      200,
      {
        products: results,
        catalogVersion: lastSnapshot?.version ?? 0,
      },
      request
    );
  });

  // docs/POS_SETTINGS_ARCHITECTURE.md §4 — PaymentTerminal.type → the
  // camelCase key it appears under in settings.paymentProviders. A
  // `type` with no entry here (a value the vocabulary grows to include
  // later, §3's "String, not an enum" reasoning) is skipped rather than
  // sent under some fallback key — an unrecognized key would be
  // meaningless to a till that only knows the fixed set of aliases §4
  // documents.
  const PAYMENT_TERMINAL_TYPE_TO_KEY: Record<string, string> = {
    CASH: 'cash',
    CARD_PINPAD: 'cardPinpad',
    QR_UZQR: 'uzQr',
    QR_PAYME: 'payme',
    QR_CLICK: 'click',
    QR_STATIC: 'qrStatic',
    // docs/POS_SYNC_API.md §23.1 — Demo Store Tashkent's real recorded
    // paymentMethods uses this exact type, distinct from QR_STATIC
    // above (not folded into it — the two are different real values,
    // not a typo of each other).
    QR_STATIC_MANUAL: 'qrStaticManual',
    BANK_TRANSFER: 'bankTransfer',
  };

  fastify.get('/pos/v1/settings', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    // docs/POS_POLICY_ENGINE.md §6 — this replaces the old single
    // { version, checksum, settings } shape with three independently
    // versioned blocks. Fetched in parallel: PosSettings (tenant-scoped,
    // may not exist yet), the global PlatformPolicyVersion counter, and
    // enabled PlatformPolicy rows (also global, never tenant-scoped).
    const [stored, platformPolicyVersion, platformPolicies, operators, storeTerminals, deviceTerminals, deviceSettings] = await Promise.all([
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
        select: {
          id: true, name: true, role: true, permissions: true, active: true,
          pinRequired: true, pinHashSha256: true, pinSalt: true,
        },
      }),
      // docs/POS_SETTINGS_ARCHITECTURE.md §3/§4 — store-level defaults
      // (deviceId IS NULL) for this device's store.
      prisma.paymentTerminal.findMany({
        where: { storeId: device.storeId, deviceId: null, enabled: true },
        select: { type: true, config: true, deviceId: true },
      }),
      // §4 — this device's own overrides, if any.
      prisma.paymentTerminal.findMany({
        where: { deviceId: device.id, enabled: true },
        select: { type: true, config: true, deviceId: true },
      }),
      // docs/POS_SETTINGS_ARCHITECTURE.md §6 — this device's own
      // hardware profile, if configured.
      prisma.posDeviceSettings.findUnique({
        where: { deviceId: device.id },
        select: { printer: true, scanner: true, pinPad: true, scale: true, display: true },
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

    // docs/POS_SETTINGS_ARCHITECTURE.md §4 — server-side store/device
    // merge, resolved 2026-07-17 with the Android team: the till
    // performs none of this itself, it only ever sees the flattened
    // result below. Store-level rows first, then device-level rows
    // overwrite by `type` (Map insertion order doesn't matter here,
    // only that device rows are set second so they win). Existing
    // settings.paymentMethods (the old flat-array shape, §1) is left
    // completely untouched above — this is purely additive, sent
    // alongside it (§7 backward-compat).
    const resolvedTerminalsByType = new Map<string, { config: unknown; deviceId: string | null }>();
    for (const terminal of storeTerminals) resolvedTerminalsByType.set(terminal.type, terminal);
    for (const terminal of deviceTerminals) resolvedTerminalsByType.set(terminal.type, terminal);

    const paymentProviders: Record<string, unknown> = {};
    for (const [type, terminal] of resolvedTerminalsByType) {
      const key = PAYMENT_TERMINAL_TYPE_TO_KEY[type];
      if (!key) continue;
      const config = terminal.config && typeof terminal.config === 'object' ? (terminal.config as Record<string, unknown>) : {};
      paymentProviders[key] = {
        enabled: true,
        ...config,
        // §4 — which layer this device's active configuration for this
        // type actually came from: STORE (the store-wide default) or
        // DEVICE (this specific till has its own override). Not
        // derived from `config` — sourced from the resolved row's own
        // deviceId, set above by which of the two findMany results
        // last wrote this `type` into the map.
        scope: terminal.deviceId ? 'DEVICE' : 'STORE',
      };
    }
    (settings as Record<string, unknown>).paymentProviders = paymentProviders;

    // docs/POS_SETTINGS_ARCHITECTURE.md §6/§9 step 5 — settles that
    // document's open placement question: hardware lives nested inside
    // `settings`, a sibling of paymentProviders/storeTimezone/etc., not
    // a top-level sibling of `settings` itself. `null` per-field (not
    // an absent key, not an empty object) for a device with no
    // PosDeviceSettings row at all or no value set for that one field —
    // same "absent means unconfigured" convention as every other
    // optional field in this response.
    (settings as Record<string, unknown>).hardware = {
      printer: deviceSettings?.printer ?? null,
      scanner: deviceSettings?.scanner ?? null,
      pinPad: deviceSettings?.pinPad ?? null,
      scale: deviceSettings?.scale ?? null,
      display: deviceSettings?.display ?? null,
    };

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
            // docs/POS_POLICY_ENGINE.md §14.1 — offline-first requirement:
            // the till must be able to verify a cashier's PIN with no
            // server round-trip, so the hash+salt pair travels with the
            // rest of the staff roster instead of staying server-side.
            // Deliberate tradeoff, not an oversight — a 4-6 digit PIN is
            // brute-forceable from this pair given physical access to the
            // device, but the threat model here is "prevent a co-worker
            // without this PIN from acting as this cashier," not
            // "withstand a compromised till," and the cashier already has
            // physical access to the device the PIN protects.
            pinRequired: op.pinRequired,
            pinHashSha256: op.pinHashSha256 ?? null,
            pinSalt: op.pinSalt ?? null,
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

  // docs/CUSTOMER_LOYALTY.md §5/§13 step 2 — cashier scans a card/QR or
  // types a phone number before ringing up a sale. Same auth as every
  // other /pos/v1/* route (resolveAuthenticatedDevice), tenant-scoped
  // through device.tenantId, not a new mechanism.
  fastify.get('/pos/v1/customer', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const query = customerLookupQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid customer lookup query', request, {
        issues: query.error.issues,
      });
    }
    const { phone, loyaltyCard } = query.data;
    if (!phone && !loyaltyCard) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'phone or loyaltyCard query parameter is required', request);
    }

    // loyaltyCardNumber is globally @unique (§4), so tenantId isn't
    // strictly needed to disambiguate it — included anyway as a second,
    // explicit isolation check, so a card belonging to a different
    // tenant can never resolve through this device's lookup.
    const customer = loyaltyCard
      ? await prisma.customer.findFirst({ where: { tenantId: device.tenantId, loyaltyCardNumber: loyaltyCard } })
      : await prisma.customer.findFirst({ where: { tenantId: device.tenantId, phone } });

    if (!customer) {
      return sendError(reply, 404, 'CUSTOMER_NOT_FOUND', 'No matching customer', request);
    }

    const loyaltyConfig = await prisma.loyaltyConfig.findUnique({ where: { tenantId: device.tenantId } });
    const loyaltyLevel = loyaltyConfig
      ? computeTier(Number(customer.totalSpent), (loyaltyConfig.tiers as any) ?? DEFAULT_TIERS).name
      : null;

    return sendSuccess(
      reply,
      200,
      {
        id: customer.id,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || null,
        phone: customer.phone,
        telegramUser: customer.telegramUser,
        loyaltyPoints: customer.loyaltyPoints,
        loyaltyCardNumber: customer.loyaltyCardNumber,
        loyaltyLevel,
      },
      request
    );
  });

  // docs/CUSTOMER_LOYALTY.md §5/§13 step 2 — cashier registers a buyer who
  // has no Telegram account at all (the reason Customer.telegramId became
  // nullable, §4). No storeId is written: Customer has never been
  // store-scoped in this schema (tenantId only, same as every other
  // Sellgram-created customer) — a POS-registered buyer is reachable from
  // any store in the tenant, matching how a Telegram customer already is.
  fastify.post('/pos/v1/customer', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const body = createPosCustomerSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid customer', request, { issues: body.error.issues });
    }

    // A cashier-entered name has no first/last split at the till — first
    // word becomes firstName (used everywhere else Customer.firstName is
    // displayed), the rest (if any) becomes lastName; matches how
    // GET /pos/v1/customer's `name` field is reassembled from the same
    // two columns above.
    const parts = body.data.name.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ') || null;

    const customer = await prisma.$transaction(async (tx) => {
      const loyaltyCardNumber = await generateLoyaltyCardNumber(tx);
      return tx.customer.create({
        data: {
          tenantId: device.tenantId,
          telegramId: null,
          firstName,
          lastName,
          phone: body.data.phone,
          loyaltyCardNumber,
          loyaltyCardQr: loyaltyCardNumber,
        },
      });
    });

    return sendSuccess(
      reply,
      201,
      {
        id: customer.id,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
        phone: customer.phone,
        loyaltyCardNumber: customer.loyaltyCardNumber,
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
            // docs/CUSTOMER_LOYALTY.md §7/§13 step 3 — the Prisma-create
            // side of the customerId field; see the schema comment above
            // for why both sides must land together.
            customerId: body.data.customerId ?? null,
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

        // Loyalty accrual moved to POST /pos/v1/fiscal-events (see that
        // handler below) — a receipt is only "real" once fiscalized
        // (FISCAL_SUCCESS/fiscalStatus SUCCESS), which this event's own
        // SALE_COMPLETED status cannot guarantee on its own.
        // docs/CUSTOMER_LOYALTY.md §7 (revised).

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
    // Captured across both branches below (fresh create vs. P2002 replay)
    // so loyalty accrual (further down) always has a real row to work
    // from, whichever path produced it.
    let savedEvent;
    let isNewlyCreated = true;
    try {
      savedEvent = await prisma.fiscalEvent.create({
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
          // docs/CUSTOMER_LOYALTY.md §7 (revised) — the Prisma-create side
          // of the customerId field; see the Zod schema comment above for
          // why both sides must land together.
          customerId: body.data.customerId ?? null,
          // docs/POS_POLICY_ENGINE.md §14.1 — same both-sides-together
          // reasoning as customerId just above.
          operatorId: body.data.operatorId ?? null,
          operatorName: body.data.operatorName ?? null,
          operatorRole: body.data.operatorRole ?? null,
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
        isNewlyCreated = false;
        // Re-fetch the row a retry collided with — needed below so a
        // retry that arrives *after* the original request crashed before
        // reaching accrual still gets a chance to accrue exactly once
        // (the sourceType/sourceId check inside accrueFiscalLoyalty
        // makes a second attempt on an already-accrued row a no-op).
        savedEvent = await prisma.fiscalEvent.findUnique({
          where: { deviceId_eventId: { deviceId: device.id, eventId: body.data.eventId } },
        });
      } else {
        throw err;
      }
    }

    // docs/CUSTOMER_LOYALTY.md §7 (revised, per Android's confirmed §14.6
    // enforcement pass) — loyalty accrual now keys off FISCAL_SUCCESS, not
    // SALE_COMPLETED: a receipt is only "real" once fiscalized, which a
    // sale event's own status can't guarantee on its own. Isolated in its
    // own try/catch, deliberately outside the fiscalEvent.create() above —
    // a failure here must never turn an already-stored fiscal event into
    // an error response to the till. Both accrual (SALE) and reversal
    // (REFUND) are called unconditionally — each self-guards on
    // receiptType and no-ops immediately for the other case, so exactly
    // one of the two ever does real work for a given event.
    if (savedEvent) {
      try {
        await accrueFiscalLoyalty(savedEvent, device.tenantId);
        await reverseFiscalLoyaltyForRefund(savedEvent, device.tenantId);
      } catch (err: any) {
        request.log.error(
          { err, fiscalEventId: savedEvent.id, tenantId: device.tenantId },
          'pos-sync: loyalty accrual/reversal failed for fiscal event'
        );
      }
    }

    return sendAck(reply, isNewlyCreated ? 201 : 200, request);
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

  // docs/POS_SYNC_API.md §24 — operator audit trail (lock/login/switch,
  // failed/blocked PIN attempts, docs/POS_POLICY_ENGINE.md §14.1). Uses
  // the general envelope with a `data` object (unlike fiscal/shift-events'
  // bare sendAck) — mirrors sale-events' find-existing-then-create
  // idempotency shape, since a replay here also needs to return the same
  // { id, eventType, createdAt } the original 201 did, not just an ack.
  fastify.post('/pos/v1/operator-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const body = operatorEventSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid operator event', request, {
        issues: body.error.issues,
      });
    }

    const findExisting = () =>
      prisma.posOperatorEvent.findUnique({
        where: { deviceId_idempotencyKey: { deviceId: device.id, idempotencyKey: body.data.idempotencyKey } },
        select: { id: true, eventType: true, createdAt: true },
      });

    const existing = await findExisting();
    if (existing) {
      return sendSuccess(reply, 200, existing, request);
    }

    // §24 — deviceCreatedAtMs is the till's own event time, kept
    // alongside whatever else the device sends; this row's own
    // `createdAt` column stays Cloud's receipt timestamp
    // (@default(now())), not overridable by the request (see the Zod
    // schema comment above).
    const payload = { ...(body.data.payload ?? {}), deviceCreatedAtMs: body.data.createdAt };

    let event;
    try {
      event = await prisma.posOperatorEvent.create({
        data: {
          tenantId: device.tenantId,
          storeId: device.storeId,
          deviceId: device.id,
          eventType: body.data.eventType,
          operatorId: body.data.operatorId ?? null,
          actorId: body.data.actorId ?? null,
          idempotencyKey: body.data.idempotencyKey,
          payload: payload as any,
        },
        select: { id: true, eventType: true, createdAt: true },
      });
    } catch (err: any) {
      // Concurrent duplicate lost the unique-idempotencyKey race —
      // resolve it exactly like a replay that arrived a moment later
      // (same pattern as sale-events).
      if (err?.code === 'P2002') {
        const winner = await findExisting();
        if (winner) return sendSuccess(reply, 200, winner, request);
      }
      throw err;
    }

    return sendSuccess(reply, 201, event, request);
  });

  // docs/POS_SYNC_API.md §25 — universal payment-provider event stream,
  // separate from fiscal-events (payment provider's side of a
  // transaction, not the fiscal receipt's side — see the schema comment
  // on PosPaymentEvent for the split). Same find-existing-then-create
  // idempotency shape as operator-events just above, keyed on
  // @@unique([deviceId, idempotencyKey]) rather than fiscal/shift-events'
  // eventId — a replay must return the same { id, eventType, status,
  // createdAt } the original 201 did, not just a bare ack.
  fastify.post('/pos/v1/payment-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveAuthenticatedDevice(request, reply);
    if (!device) return;

    const body = paymentEventSchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid payment event', request, {
        issues: body.error.issues,
      });
    }

    const findExisting = () =>
      prisma.posPaymentEvent.findUnique({
        where: { deviceId_idempotencyKey: { deviceId: device.id, idempotencyKey: body.data.idempotencyKey } },
        select: { id: true, eventType: true, status: true, createdAt: true },
      });

    const existing = await findExisting();
    if (existing) {
      return sendSuccess(reply, 200, existing, request);
    }

    const toDate = (ms: number | null | undefined) => (ms != null ? new Date(ms) : null);

    let event;
    try {
      event = await prisma.posPaymentEvent.create({
        data: {
          tenantId: device.tenantId,
          storeId: device.storeId,
          deviceId: device.id,
          eventId: body.data.eventId,
          eventType: body.data.eventType,
          aggregateType: body.data.aggregateType,
          aggregateId: body.data.aggregateId,
          schemaVersion: body.data.schemaVersion,
          idempotencyKey: body.data.idempotencyKey,
          provider: body.data.provider,
          paymentMethod: body.data.paymentMethod,
          operation: body.data.operation,
          status: body.data.status,
          amount: body.data.amount,
          currency: body.data.currency,
          providerPaymentId: body.data.providerPaymentId ?? null,
          providerInvoiceId: body.data.providerInvoiceId ?? null,
          providerRefundId: body.data.providerRefundId ?? null,
          saleId: body.data.saleId ?? null,
          refundId: body.data.refundId ?? null,
          fiscalReceiptId: body.data.fiscalReceiptId ?? null,
          terminalId: body.data.terminalId ?? null,
          shiftId: body.data.shiftId ?? null,
          cashierId: body.data.cashierId ?? null,
          cashierName: body.data.cashierName ?? null,
          cashierRole: body.data.cashierRole ?? null,
          createdAtMs: toDate(body.data.createdAtMs),
          updatedAtMs: toDate(body.data.updatedAtMs),
          completedAtMs: toDate(body.data.completedAtMs),
          reason: body.data.reason ?? null,
          rawProviderStatus: (body.data.rawProviderStatus ?? {}) as any,
        },
        select: { id: true, eventType: true, status: true, createdAt: true },
      });
    } catch (err: any) {
      // Concurrent duplicate lost the unique-idempotencyKey race —
      // resolve it exactly like a replay that arrived a moment later
      // (same pattern as operator-events/sale-events).
      if (err?.code === 'P2002') {
        const winner = await findExisting();
        if (winner) return sendSuccess(reply, 200, winner, request);
      }
      throw err;
    }

    return sendSuccess(reply, 201, event, request);
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
      take: 10,
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
