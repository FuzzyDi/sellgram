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
        },
        orderBy: { createdAt: 'asc' },
      });

      const categories = await prisma.category.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, slug: true, sortOrder: true, parentId: true },
        orderBy: { sortOrder: 'asc' },
      });

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
          payload: { categories, products, barcodes: [], uzProfiles: [] } as any,
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
