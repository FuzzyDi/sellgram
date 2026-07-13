import type { FastifyInstance } from 'fastify';
import { randomInt } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

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

const listOperatorsQuerySchema = z.object({
  storeId: z.string().min(1),
});

const createOperatorSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1).max(200),
  role: posOperatorRoleSchema,
  permissions: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

const updateOperatorSchema = z
  .object({
    name: z.string().min(1).max(200),
    role: posOperatorRoleSchema,
    permissions: z.array(z.string()),
    active: z.boolean(),
  })
  .partial();

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

      return reply.status(200).send({ success: true, data: devices });
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

      // Bulk-fetched once (global, small — 7 seed rows plus whatever
      // tenant-custom types exist) so mergeRules can walk a
      // parentTypeId chain of any depth without a query per product.
      // ProductType.rules is unconstrained Json (docs/PRODUCT_TYPES.md
      // §4) — cast through `any` rather than typing every ruleId shape.
      const allProductTypes = await prisma.productType.findMany({
        select: { id: true, rules: true, parentTypeId: true },
      });
      const typesById = new Map(allProductTypes.map((t) => [t.id, t]));

      // docs/PRODUCT_TYPES.md §4 inheritance: child overlays parent by
      // ruleId, BLOCK always wins over WARN for a shared ruleId, parent
      // rules the child doesn't mention pass through unchanged. Walks
      // root-to-leaf (reversed after collecting leaf-to-root) so a
      // later, more-specific entry in the chain is what actually
      // overrides an earlier, less-specific one below.
      function mergeRules(productTypeId: string | null | undefined): any[] {
        if (!productTypeId) return [];
        const chain: any[][] = [];
        let current = typesById.get(productTypeId);
        const visited = new Set<string>();
        while (current) {
          chain.push(Array.isArray(current.rules) ? (current.rules as any[]) : []);
          if (!current.parentTypeId || visited.has(current.parentTypeId)) break;
          visited.add(current.parentTypeId);
          current = typesById.get(current.parentTypeId);
        }
        chain.reverse(); // root first, leaf (the product's own type) last

        const merged = new Map<string, any>();
        for (const ruleArr of chain) {
          for (const rule of ruleArr) {
            const existing = merged.get(rule.ruleId);
            // A less-specific ancestor already blocking this ruleId
            // can't be loosened to WARN by a more-specific descendant.
            merged.set(rule.ruleId, existing?.severity === 'BLOCK' ? { ...rule, severity: 'BLOCK' } : rule);
          }
        }
        return Array.from(merged.values());
      }

      const productsForSnapshot = products.map(({ productType, ...product }) => ({
        ...product,
        productTypeCode: productType?.code ?? null,
        productTypeRules: mergeRules(product.productTypeId),
        weightMode: productType?.weightMode ?? (product.isByWeight ? 'WEIGHT' : product.isWeightedPiece ? 'PIECE_WEIGHT' : 'PIECE'),
        barcodePrefixes: productType?.barcodePrefixes ?? [],
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
        },
        orderBy: { createdAtMs: 'desc' },
        take: query.data.limit,
        ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
      });

      const nextCursor = receipts.length === query.data.limit ? receipts[receipts.length - 1]!.id : null;

      return reply.status(200).send({ success: true, data: { items: receipts, nextCursor } });
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

      const topProductsMap: Record<string, { name: string; qty: number; amount: number }> = {};
      for (const r of receipts) {
        const items = Array.isArray(r.items) ? r.items : [];
        for (const item of items as any[]) {
          const name = String(pickField(item, ['name', 'title', 'productName']) ?? 'Unknown');
          const qty = Number(pickField(item, ['qty', 'quantity']) ?? 0);
          const amount = Number(pickField(item, ['sum', 'total', 'amount']) ?? 0);
          if (!topProductsMap[name]) topProductsMap[name] = { name, qty: 0, amount: 0 };
          topProductsMap[name].qty += qty;
          topProductsMap[name].amount += amount;
        }
      }
      const topProducts = Object.values(topProductsMap)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10);

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

      const operator = await prisma.posOperator.create({
        data: {
          tenantId,
          storeId: store.id,
          name: body.data.name,
          role: body.data.role,
          permissions: body.data.permissions,
          active: body.data.active,
        },
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

      const operator = await prisma.posOperator.update({
        where: { id: existing.id },
        data: body.data,
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
}
