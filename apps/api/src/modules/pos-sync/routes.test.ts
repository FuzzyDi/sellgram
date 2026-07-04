import Fastify from 'fastify';
import type { FastifyServerOptions } from 'fastify';
import { Writable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    deviceActivation: { findUnique: vi.fn(), update: vi.fn() },
    posDevice: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    syncCursor: { upsert: vi.fn().mockResolvedValue({}) },
    catalogSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
    posSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ planExpiresAt: null, blockedAt: null }) },
    saleEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    stockEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ stockQty: 0 }),
    },
    productVariant: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ stockQty: 0 }),
    },
    stockLedgerEntry: { createMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn().mockResolvedValue({}) },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    fiscalEvent: { create: vi.fn().mockResolvedValue({}) },
    shiftEvent: { create: vi.fn().mockResolvedValue({}) },
    cloudCommand: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import posSyncRoutes from './routes.js';

async function buildApp(options?: FastifyServerOptions) {
  const app = Fastify(options);
  await app.register(posSyncRoutes, { prefix: '/api' });
  return app;
}

describe('pos-sync.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validActivatePayload = {
    activationCode: 'ABCD-1234',
    deviceFingerprint: 'fp-1',
    deviceName: 'POS-1',
    deviceType: 'ANDROID',
    appVersion: '0.1.0',
  };

  describe('POST /api/pos/v1/activate', () => {
    it('confirms a pending, non-expired activation and returns device tokens', async () => {
      mocks.prisma.deviceActivation.findUnique.mockResolvedValue({
        id: 'act-1',
        deviceId: 'dev-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        device: { id: 'dev-1' },
      });
      mocks.prisma.$transaction.mockResolvedValue([
        { id: 'dev-1', tenantId: 't-1', storeId: 's-1' },
        {},
        {},
      ]);
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({ version: 2 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/activate',
        payload: validActivatePayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(typeof body.requestId).toBe('string');
      expect(body.data.deviceId).toBe('dev-1');
      expect(body.data.tenantId).toBe('t-1');
      expect(body.data.storeId).toBe('s-1');
      expect(typeof body.data.accessToken).toBe('string');
      expect(body.data.accessToken.startsWith('pos_')).toBe(true);
      expect(typeof body.data.refreshToken).toBe('string');
      expect(body.data.refreshToken.startsWith('posr_')).toBe(true);
      expect(body.data.accessToken).not.toBe(body.data.refreshToken);
      expect(body.data.catalogVersion).toBe(2);
      expect(body.data.settingsVersion).toBe(1);
      await app.close();
    });

    it('logs, but does not block, when the device fingerprint already belongs to another active device', async () => {
      mocks.prisma.deviceActivation.findUnique.mockResolvedValue({
        id: 'act-1',
        deviceId: 'dev-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        device: { id: 'dev-1' },
      });
      mocks.prisma.posDevice.findFirst.mockResolvedValueOnce({ id: 'dev-other' });
      mocks.prisma.$transaction.mockResolvedValue([
        { id: 'dev-1', tenantId: 't-1', storeId: 's-1' },
        {},
        {},
      ]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/activate',
        payload: validActivatePayload,
      });

      expect(response.statusCode).toBe(201);
      await app.close();
    });

    it('returns 404 INVALID_ACTIVATION_CODE for an unknown activation code', async () => {
      mocks.prisma.deviceActivation.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/activate',
        payload: { ...validActivatePayload, activationCode: 'NOPE-0000' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('INVALID_ACTIVATION_CODE');
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });

    it('marks an expired pending activation as EXPIRED and returns 400 ACTIVATION_CODE_EXPIRED', async () => {
      mocks.prisma.deviceActivation.findUnique.mockResolvedValue({
        id: 'act-2',
        deviceId: 'dev-2',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/activate',
        payload: { ...validActivatePayload, activationCode: 'EXPI-RED0' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('ACTIVATION_CODE_EXPIRED');
      expect(mocks.prisma.deviceActivation.update).toHaveBeenCalledWith({
        where: { id: 'act-2' },
        data: { status: 'EXPIRED' },
      });
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 ACTIVATION_CODE_ALREADY_USED for an already-confirmed activation code', async () => {
      mocks.prisma.deviceActivation.findUnique.mockResolvedValue({
        id: 'act-3',
        deviceId: 'dev-3',
        status: 'CONFIRMED',
        expiresAt: new Date(Date.now() + 60_000),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/activate',
        payload: { ...validActivatePayload, activationCode: 'USED-CODE' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('ACTIVATION_CODE_ALREADY_USED');
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when activationCode is missing', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/api/pos/v1/activate', payload: {} });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when deviceFingerprint is missing', async () => {
      const { deviceFingerprint: _omit, ...payload } = validActivatePayload;
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/api/pos/v1/activate', payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });
  });

  // X-Device-Code enforcement is implemented once, shared by every
  // authenticated endpoint via resolveAuthenticatedDevice() — exercised
  // here through heartbeat as the representative endpoint, rather than
  // duplicated per endpoint (each endpoint's own describe block already
  // sends a matching header on every other test, exercising the
  // happy-path wiring for that specific route).
  describe('X-Device-Code header enforcement (shared across pos-sync endpoints)', () => {
    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
    });

    it('returns 400 VALIDATION_ERROR when X-Device-Code is missing, even with a valid Bearer token', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 401 and logs a security-warning when X-Device-Code does not match the authenticated device', async () => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk, _enc, cb) {
          lines.push(chunk.toString());
          cb();
        },
      });

      const app = await buildApp({ logger: { level: 'warn', stream } });
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'wrong-code' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
      const warnLine = lines.find((l) => l.includes('X-Device-Code') || l.includes('mismatched credentials'));
      expect(warnLine).toBeTruthy();
      await app.close();
    });

    it('does not reach the resolveDevice/Bearer check before the X-Device-Code presence check', async () => {
      // No Authorization header at all — if X-Device-Code presence were
      // checked after Bearer resolution, this would be 401; it must be
      // 400, since the header is missing regardless of Bearer validity.
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/api/pos/v1/heartbeat' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });
  });

  const validHeartbeatPayload = {
    deviceId: 'dev-1',
    localTime: '2026-07-03T10:00:00+05:00',
    appVersion: '0.1.0',
    localCoreVersion: '0.1.0',
    shiftState: 'OPEN',
    unsyncedEvents: 0,
    fiscal: { status: 'OK', terminalId: 'term-1', unsentCount: 0, zRemaining: 10 },
    printer: { status: 'OK' },
    network: { status: 'ONLINE' },
  };

  describe('POST /api/pos/v1/heartbeat', () => {
    it('updates lastSeenAt and returns license/version info for a valid device key', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.tenant.findUnique.mockResolvedValue({ planExpiresAt: null, blockedAt: null });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({ version: 4 });
      mocks.prisma.posSettings.findUnique.mockResolvedValueOnce({ version: 7 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validHeartbeatPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.posDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'dev-1' } })
      );
      const body = response.json();
      expect(typeof body.requestId).toBe('string');
      expect(body.data.licenseStatus).toBe('ACTIVE');
      expect(body.data.catalogVersion).toBe(4);
      expect(body.data.settingsVersion).toBe(7);
      expect(body.data.hasCommands).toBe(false);
      await app.close();
    });

    it('reflects a BLOCKED tenant in licenseStatus', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.tenant.findUnique.mockResolvedValue({ planExpiresAt: null, blockedAt: new Date() });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validHeartbeatPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.licenseStatus).toBe('BLOCKED');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when body deviceId does not match the authenticated device', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validHeartbeatPayload, deviceId: 'dev-other' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when a required field is missing', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      const { fiscal: _omit, ...payload } = validHeartbeatPayload;

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 401 without an Authorization header', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 401 for an inactive/unknown device key', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_unknown', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('GET /api/pos/v1/catalog/snapshot', () => {
    it('returns the latest snapshot in the contract shape for the device store', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({
        version: 3,
        payload: {
          categories: [{ id: 'c-1', name: 'Drinks' }],
          products: [{ id: 'p-1', name: 'Cola' }],
          barcodes: [],
          uzProfiles: [],
        },
        createdAt: new Date(),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot?storeId=s-1',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.requestId).toBe('string');
      expect(body.data.version).toBe(3);
      expect(typeof body.data.checksum).toBe('string');
      expect(body.data.full).toBe(true);
      expect(body.data.categories).toEqual([{ id: 'c-1', name: 'Drinks' }]);
      expect(body.data.products).toEqual([{ id: 'p-1', name: 'Cola' }]);
      expect(body.data.barcodes).toEqual([]);
      expect(body.data.uzProfiles).toEqual([]);
      expect(mocks.prisma.syncCursor.upsert).toHaveBeenCalled();
      await app.close();
    });

    it('serves legacy { products }-only snapshots with empty arrays for the missing keys', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({
        version: 1, payload: { products: [{ id: 'p-1' }] }, createdAt: new Date(),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot?storeId=s-1',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.products).toEqual([{ id: 'p-1' }]);
      expect(body.data.categories).toEqual([]);
      expect(body.data.barcodes).toEqual([]);
      expect(body.data.uzProfiles).toEqual([]);
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when storeId is missing', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it("returns 400 VALIDATION_ERROR when storeId is not the device's own store", async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot?storeId=s-other',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(mocks.prisma.catalogSnapshot.findFirst).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 NO_SNAPSHOT_AVAILABLE when no snapshot exists yet', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot?storeId=s-1',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NO_SNAPSHOT_AVAILABLE');
      await app.close();
    });

    it('returns 401 for an invalid device key', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot?storeId=s-1',
        headers: { authorization: 'Bearer bad', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('GET /api/pos/v1/settings', () => {
    it('serves the stored PosSettings document with version and checksum', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      const payload = {
        taxProfile: { vat: 12 },
        paymentMethods: [{ code: 'cash' }],
        receiptTemplate: {},
        printerProfile: {},
        fiscalProfile: {},
        offlineLimits: {},
        roundingRules: {},
        featureFlags: {},
      };
      mocks.prisma.posSettings.findUnique.mockResolvedValue({ version: 4, payload });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.requestId).toBe('string');
      expect(body.data.version).toBe(4);
      expect(typeof body.data.checksum).toBe('string');
      expect(body.data.settings).toEqual(payload);
      await app.close();
    });

    it('serves empty eight-key defaults as version 1 when no PosSettings row exists', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.posSettings.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.version).toBe(1);
      expect(body.data.settings).toEqual({
        taxProfile: {},
        paymentMethods: [],
        receiptTemplate: {},
        printerProfile: {},
        fiscalProfile: {},
        offlineLimits: {},
        roundingRules: {},
        featureFlags: {},
      });
      await app.close();
    });

    it('returns 401 for a missing device key', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('POST /api/pos/v1/sale-events', () => {
    const validSaleEvent = {
      deviceId: 'dev-1',
      storeId: 's-1',
      localSaleId: 'SALE-000001',
      localShiftId: 'SHIFT-000001',
      eventType: 'SALE_COMPLETED',
      status: 'COMPLETED',
      receiptNumber: 42,
      idempotencyKey: 'dev-1:sale:SALE-000001:SALE_COMPLETED',
      occurredAt: '2026-07-04T10:00:00+05:00',
      items: [
        { productId: 'p-1', quantity: 2, price: 10000 },
        { productId: 'p-2', variantId: 'v-1', quantity: 1, price: 5000 },
      ],
      payments: [{ method: 'cash', amount: 25000 }],
      totals: { total: 25000 },
      fiscal: { status: 'OK' },
      print: { status: 'OK' },
    };

    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.saleEvent.findUnique.mockResolvedValue(null);
      mocks.prisma.saleEvent.create.mockResolvedValue({ id: 'evt-1' });
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }]);
      mocks.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v-1', productId: 'p-2' }]);
      mocks.prisma.product.update.mockResolvedValue({ stockQty: 8 });
      mocks.prisma.productVariant.update.mockResolvedValue({ stockQty: 4 });
      mocks.prisma.stockLedgerEntry.create.mockResolvedValue({});
      mocks.prisma.stockMovement.create.mockResolvedValue({});
      mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(mocks.prisma));
    });

    it('ingests a SALE_COMPLETED event, derives stock ledger entries and moves live stockQty', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validSaleEvent,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(typeof body.requestId).toBe('string');
      expect(body.data.eventId).toBe('evt-1');
      expect(body.data.warnings).toEqual([]);
      expect(mocks.prisma.saleEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            idempotencyKey: validSaleEvent.idempotencyKey,
            eventType: 'SALE_COMPLETED',
          }),
        })
      );

      // p-1 (no variant): product.stockQty moved, ledger + movement written
      expect(mocks.prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { stockQty: { increment: -2 } },
        select: { stockQty: true },
      });
      expect(mocks.prisma.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-1', variantId: null, delta: -2, reason: 'POS_SALE', sourceType: 'SaleEvent', sourceId: 'evt-1' }),
      });
      expect(mocks.prisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-1', delta: -2, qtyBefore: 10, qtyAfter: 8 }),
      });

      // p-2/v-1 (variant): productVariant.stockQty moved instead
      expect(mocks.prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'v-1' },
        data: { stockQty: { increment: -1 } },
        select: { stockQty: true },
      });
      expect(mocks.prisma.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-2', variantId: 'v-1', delta: -1, reason: 'POS_SALE', sourceId: 'evt-1' }),
      });
      expect(mocks.prisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-2', variantId: 'v-1', delta: -1, qtyBefore: 5, qtyAfter: 4 }),
      });
      await app.close();
    });

    it('does not derive stock for a non-completing event type', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: {
          ...validSaleEvent,
          eventType: 'SALE_PAID',
          idempotencyKey: 'dev-1:sale:SALE-000001:SALE_PAID',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.product.findMany).not.toHaveBeenCalled();
      expect(mocks.prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
      expect(mocks.prisma.stockMovement.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('accepts an unknown product with an UNKNOWN_PRODUCT warning and skips its ledger row', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: {
          ...validSaleEvent,
          items: [
            { productId: 'p-1', quantity: 2 },
            { productId: 'p-ghost', quantity: 1 },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.warnings).toEqual([
        expect.objectContaining({ index: 1, code: 'UNKNOWN_PRODUCT', productId: 'p-ghost' }),
      ]);
      expect(mocks.prisma.stockLedgerEntry.create).toHaveBeenCalledTimes(1);
      expect(mocks.prisma.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-1', delta: -2 }),
      });
      await app.close();
    });

    it('flags a non-integer quantity with INVALID_QUANTITY and skips its ledger row', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: {
          ...validSaleEvent,
          items: [{ productId: 'p-1', quantity: 1.5 }],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.warnings).toEqual([
        expect.objectContaining({ index: 0, code: 'INVALID_QUANTITY' }),
      ]);
      expect(mocks.prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
      expect(mocks.prisma.stockMovement.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('flags a variantId that does not belong to productId with UNKNOWN_VARIANT and skips its ledger row', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
      mocks.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v-other', productId: 'p-other' }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: {
          ...validSaleEvent,
          items: [{ productId: 'p-1', variantId: 'v-other', quantity: 1 }],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.warnings).toEqual([
        expect.objectContaining({ index: 0, code: 'UNKNOWN_VARIANT', productId: 'p-1' }),
      ]);
      expect(mocks.prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
      expect(mocks.prisma.stockMovement.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('replays an identical duplicate with the stored result and no side effects', async () => {
      // First deliver the event for real to learn the exact payloadHash the
      // handler computes, then replay against a stored row with that hash.
      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validSaleEvent,
      });
      const storedHash = mocks.prisma.saleEvent.create.mock.calls[0][0].data.payloadHash;

      vi.clearAllMocks();
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.saleEvent.findUnique.mockResolvedValue({
        id: 'evt-1', payloadHash: storedHash, warnings: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validSaleEvent,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data).toEqual({ eventId: 'evt-1', warnings: [] });
      expect(mocks.prisma.saleEvent.create).not.toHaveBeenCalled();
      expect(mocks.prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
      expect(mocks.prisma.stockMovement.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects a reused idempotencyKey with a different payload as 409', async () => {
      mocks.prisma.saleEvent.findUnique.mockResolvedValue({
        id: 'evt-1', payloadHash: 'a-different-hash', warnings: [],
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validSaleEvent,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(mocks.prisma.saleEvent.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when body deviceId does not match the authenticated device', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validSaleEvent, deviceId: 'dev-other' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it("returns 400 VALIDATION_ERROR when body storeId does not match the device's store", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validSaleEvent, storeId: 's-other' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when a required field is missing', async () => {
      const { idempotencyKey: _omit, ...payload } = validSaleEvent;

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 401 without an Authorization header', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { 'x-device-code': 'code-1' },
        payload: validSaleEvent,
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('POST /api/pos/v1/stock-events', () => {
    const validStockEvent = {
      deviceId: 'dev-1',
      storeId: 's-1',
      productId: 'p-1',
      variantId: null,
      delta: 10,
      reason: 'RESTOCK',
      idempotencyKey: 'dev-1:stock:STK-000001:RESTOCK',
      occurredAt: '2026-07-04T11:00:00+05:00',
      note: 'manual restock at the till',
    };

    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.stockEvent.findUnique.mockResolvedValue(null);
      mocks.prisma.stockEvent.create.mockResolvedValue({ id: 'stk-1' });
      mocks.prisma.product.findFirst.mockResolvedValue({ id: 'p-1' });
      mocks.prisma.productVariant.findUnique.mockResolvedValue(null);
      mocks.prisma.product.update.mockResolvedValue({ stockQty: 20 });
      mocks.prisma.productVariant.update.mockResolvedValue({ stockQty: 20 });
      mocks.prisma.stockLedgerEntry.create.mockResolvedValue({});
      mocks.prisma.stockMovement.create.mockResolvedValue({});
      mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(mocks.prisma));
    });

    it('ingests a RESTOCK event, derives a positive-delta ledger entry, and moves live stockQty', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validStockEvent,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(typeof body.requestId).toBe('string');
      expect(body.data.eventId).toBe('stk-1');
      expect(body.data.warnings).toEqual([]);
      expect(mocks.prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { stockQty: { increment: 10 } },
        select: { stockQty: true },
      });
      expect(mocks.prisma.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'p-1', delta: 10, reason: 'RESTOCK',
          sourceType: 'StockEvent', sourceId: 'stk-1',
        }),
      });
      expect(mocks.prisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: 'p-1', delta: 10, qtyBefore: 10, qtyAfter: 20 }),
      });
      await app.close();
    });

    it('ingests a negative POS_ADJUSTMENT and keeps the signed delta', async () => {
      mocks.prisma.product.update.mockResolvedValue({ stockQty: 7 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: {
          ...validStockEvent,
          delta: -3,
          reason: 'POS_ADJUSTMENT',
          idempotencyKey: 'dev-1:stock:STK-000002:POS_ADJUSTMENT',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ delta: -3, reason: 'POS_ADJUSTMENT' }),
      });
      expect(mocks.prisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ delta: -3, qtyBefore: 10, qtyAfter: 7 }),
      });
      await app.close();
    });

    it('stores an unknown-product event with a warning and derives no ledger row', async () => {
      mocks.prisma.product.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validStockEvent, productId: 'p-ghost' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.warnings).toEqual([
        expect.objectContaining({ index: 0, code: 'UNKNOWN_PRODUCT', productId: 'p-ghost' }),
      ]);
      expect(mocks.prisma.stockEvent.create).toHaveBeenCalled();
      expect(mocks.prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
      expect(mocks.prisma.stockMovement.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('stores an unknown-variant event with a warning and derives no ledger row', async () => {
      mocks.prisma.productVariant.findUnique.mockResolvedValue({ id: 'v-other', productId: 'p-other' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validStockEvent, variantId: 'v-other' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.warnings).toEqual([
        expect.objectContaining({ index: 0, code: 'UNKNOWN_VARIANT', productId: 'p-1' }),
      ]);
      expect(mocks.prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
      expect(mocks.prisma.stockMovement.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects reason POS_SALE with 400 VALIDATION_ERROR', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validStockEvent, reason: 'POS_SALE', idempotencyKey: 'dev-1:stock:STK-000003:POS_SALE' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(mocks.prisma.stockEvent.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('replays an identical duplicate with the stored result and no side effects', async () => {
      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validStockEvent,
      });
      const storedHash = mocks.prisma.stockEvent.create.mock.calls[0][0].data.payloadHash;

      vi.clearAllMocks();
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.stockEvent.findUnique.mockResolvedValue({
        id: 'stk-1', payloadHash: storedHash, warnings: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validStockEvent,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data).toEqual({ eventId: 'stk-1', warnings: [] });
      expect(mocks.prisma.stockEvent.create).not.toHaveBeenCalled();
      expect(mocks.prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects a reused idempotencyKey with a different payload as 409', async () => {
      mocks.prisma.stockEvent.findUnique.mockResolvedValue({
        id: 'stk-1', payloadHash: 'a-different-hash', warnings: [],
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validStockEvent,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(mocks.prisma.stockEvent.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when body deviceId does not match the authenticated device', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validStockEvent, deviceId: 'dev-other' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it("returns 400 VALIDATION_ERROR when body storeId does not match the device's store", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validStockEvent, storeId: 's-other' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when a required field is missing', async () => {
      const { productId: _omit, ...payload } = validStockEvent;

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 401 without an Authorization header', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { 'x-device-code': 'code-1' },
        payload: validStockEvent,
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('POST /api/pos/v1/fiscal-events', () => {
    const validFiscalEvent = {
      eventId: 'fisc-evt-1',
      eventType: 'FISCAL_SUCCESS',
      aggregateType: 'FISCAL_RECEIPT',
      aggregateId: 'sale-1720100000000',
      schemaVersion: 1,
      shiftNumber: 1,
      localReceiptId: 'sale-1720100000000',
      daemonJournalId: 'journal-id-from-daemon',
      idempotencyKey: 'sale-1720100000000',
      receiptNumber: '20260704-0001-0001',
      receiptType: 'SALE',
      totalAmount: 12500,
      currency: 'UZS',
      payments: [{ method: 'CASH', amount: 12500, status: 'PAID', externalPaymentId: null }],
      items: [{ name: 'Marked water', barcode: '0123456789012', qty: 1000, price: 12500 }],
      createdAtMs: 1720100000000,
      fiscalizedAtMs: 1720100005000,
      fiscalStatus: 'SUCCESS',
      printStatus: 'DEMON_PRINTED',
      fiscalReceiptNumber: 1,
      fiscalSign: 'fiscalReceiptId-or-journalId',
      fiscalQr: null,
      ofdStatus: null,
      rawDaemonResponse: { ok: true },
      rawFiscalPayload: {},
    };

    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.fiscalEvent.create.mockResolvedValue({});
    });

    it('ingests a FISCAL_SUCCESS event with the simplified ack envelope', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validFiscalEvent,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toEqual({ success: true, requestId: expect.any(String) });
      expect(mocks.prisma.fiscalEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 't-1', storeId: 's-1', deviceId: 'dev-1',
          eventId: 'fisc-evt-1', eventType: 'FISCAL_SUCCESS',
          receiptNumber: '20260704-0001-0001',
          fiscalReceiptNumber: '1',
        }),
      });
      await app.close();
    });

    it('normalizes a numeric fiscalReceiptNumber/receiptNumber to string', async () => {
      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validFiscalEvent, receiptNumber: 42, fiscalReceiptNumber: 'refund-fiscal-receipt-id' },
      });

      expect(mocks.prisma.fiscalEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ receiptNumber: '42', fiscalReceiptNumber: 'refund-fiscal-receipt-id' }),
      });
      await app.close();
    });

    it('never rewrites a stored FISCAL_UNKNOWN into a success — replays it idempotently instead', async () => {
      mocks.prisma.fiscalEvent.create.mockRejectedValue(Object.assign(new Error('unique violation'), { code: 'P2002' }));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: {
          ...validFiscalEvent,
          eventId: 'fisc-evt-unknown',
          eventType: 'FISCAL_UNKNOWN',
          fiscalStatus: 'UNKNOWN',
          errorCode: 'DAEMON_FISCAL_ERROR',
          errorMessage: 'timeout or daemon error',
        },
      });

      // A retried delivery of the same eventId is acked, not turned into a
      // second write and never mutated into a different status.
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, requestId: expect.any(String) });
      expect(mocks.prisma.fiscalEvent.create).toHaveBeenCalledTimes(1);
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when a required field is missing', async () => {
      const { idempotencyKey: _omit, ...payload } = validFiscalEvent;

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 401 without an Authorization header', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { 'x-device-code': 'code-1' },
        payload: validFiscalEvent,
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('POST /api/pos/v1/shift-events', () => {
    const validShiftEvent = {
      eventId: 'shift-evt-1',
      eventType: 'SHIFT_OPENED',
      aggregateType: 'SHIFT',
      aggregateId: 'shift-1720100000000',
      idempotencyKey: 'shift-1720100000000',
      schemaVersion: 1,
      shiftNumber: 1,
      shiftState: 'OPEN',
      openedAtMs: 1720100000000,
      closedAtMs: null,
      zReportStatus: 'NOT_STARTED',
      rawDaemonResponse: {},
      rawShiftPayload: {},
    };

    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.shiftEvent.create.mockResolvedValue({});
    });

    it('ingests a SHIFT_OPENED event with the simplified ack envelope', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/shift-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validShiftEvent,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ success: true, requestId: expect.any(String) });
      expect(mocks.prisma.shiftEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventId: 'shift-evt-1', eventType: 'SHIFT_OPENED', shiftState: 'OPEN' }),
      });
      await app.close();
    });

    it('replays a duplicate eventId idempotently instead of erroring', async () => {
      mocks.prisma.shiftEvent.create.mockRejectedValue(Object.assign(new Error('unique violation'), { code: 'P2002' }));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/shift-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validShiftEvent,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, requestId: expect.any(String) });
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when a required field is missing', async () => {
      const { zReportStatus: _omit, ...payload } = validShiftEvent;

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/shift-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 401 without an Authorization header', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/shift-events',
        headers: { 'x-device-code': 'code-1' },
        payload: validShiftEvent,
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('GET /api/pos/v1/commands', () => {
    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
    });

    it('returns the literal { success, commands } shape with pending commands', async () => {
      const createdAt = new Date('2026-07-04T10:00:00.000Z');
      mocks.prisma.cloudCommand.findMany.mockResolvedValue([
        { id: 'cmd-1', type: 'PING', payload: {}, createdAt },
        { id: 'cmd-2', type: 'SHOW_MESSAGE', payload: { title: 'Message', text: 'Text for cashier' }, createdAt },
      ]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/commands',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        success: true,
        commands: [
          { id: 'cmd-1', type: 'PING', payload: {}, createdAtMs: createdAt.getTime() },
          { id: 'cmd-2', type: 'SHOW_MESSAGE', payload: { title: 'Message', text: 'Text for cashier' }, createdAtMs: createdAt.getTime() },
        ],
      });
      // No `data` wrapper and no `requestId` — this endpoint intentionally
      // does not use the general envelope (see routes.ts comment).
      expect(response.json().data).toBeUndefined();
      expect(response.json().requestId).toBeUndefined();
      await app.close();
    });

    it('returns an empty list when there are no pending commands', async () => {
      mocks.prisma.cloudCommand.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/commands',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, commands: [] });
      await app.close();
    });

    it('scopes the query to the authenticated device/tenant', async () => {
      mocks.prisma.cloudCommand.findMany.mockResolvedValue([]);

      const app = await buildApp();
      await app.inject({
        method: 'GET',
        url: '/api/pos/v1/commands',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(mocks.prisma.cloudCommand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deviceId: 'dev-1', tenantId: 't-1', status: 'PENDING' } })
      );
      await app.close();
    });

    it('returns 401 without an Authorization header', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/commands',
        headers: { 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('POST /api/pos/v1/commands/:id/ack', () => {
    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.cloudCommand.findFirst.mockResolvedValue({ id: 'cmd-1' });
      mocks.prisma.cloudCommand.update.mockResolvedValue({});
    });

    it('acks a command belonging to the authenticated device', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/commands/cmd-1/ack',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { status: 'DONE', message: null, processedAtMs: 1720100005000 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, requestId: expect.any(String) });
      expect(mocks.prisma.cloudCommand.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cmd-1', deviceId: 'dev-1', tenantId: 't-1' } })
      );
      expect(mocks.prisma.cloudCommand.update).toHaveBeenCalledWith({
        where: { id: 'cmd-1' },
        data: expect.objectContaining({ status: 'ACKED', ackStatus: 'DONE', ackMessage: null }),
      });
      await app.close();
    });

    it("returns 404 when the command does not belong to this device (tenant/device isolation)", async () => {
      mocks.prisma.cloudCommand.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/commands/cmd-other-device/ack',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { status: 'DONE' },
      });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.cloudCommand.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR for an invalid status', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/commands/cmd-1/ack',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { status: 'BOGUS' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 401 without an Authorization header', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/commands/cmd-1/ack',
        headers: { 'x-device-code': 'code-1' },
        payload: { status: 'DONE' },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });
});
