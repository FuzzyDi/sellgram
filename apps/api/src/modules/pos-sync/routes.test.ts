import Fastify from 'fastify';
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
    product: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    stockLedgerEntry: { createMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import posSyncRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
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
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.tenant.findUnique.mockResolvedValue({ planExpiresAt: null, blockedAt: null });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({ version: 4 });
      mocks.prisma.posSettings.findUnique.mockResolvedValueOnce({ version: 7 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey' },
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
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.tenant.findUnique.mockResolvedValue({ planExpiresAt: null, blockedAt: new Date() });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey' },
        payload: validHeartbeatPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.licenseStatus).toBe('BLOCKED');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when body deviceId does not match the authenticated device', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey' },
        payload: { ...validHeartbeatPayload, deviceId: 'dev-other' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when a required field is missing', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      const { fiscal: _omit, ...payload } = validHeartbeatPayload;

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey' },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 401 without an Authorization header', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/api/pos/v1/heartbeat' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 401 for an inactive/unknown device key', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_unknown' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('GET /api/pos/v1/catalog/snapshot', () => {
    it('returns the latest snapshot in the contract shape for the device store', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({
        version: 1, payload: { products: [{ id: 'p-1' }] }, createdAt: new Date(),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot?storeId=s-1',
        headers: { authorization: 'Bearer pos_validkey' },
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
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot',
        headers: { authorization: 'Bearer pos_validkey' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it("returns 400 VALIDATION_ERROR when storeId is not the device's own store", async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot?storeId=s-other',
        headers: { authorization: 'Bearer pos_validkey' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(mocks.prisma.catalogSnapshot.findFirst).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 NO_SNAPSHOT_AVAILABLE when no snapshot exists yet', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot?storeId=s-1',
        headers: { authorization: 'Bearer pos_validkey' },
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
        headers: { authorization: 'Bearer bad' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('GET /api/pos/v1/settings', () => {
    it('serves the stored PosSettings document with version and checksum', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.posSettings.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey' },
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
      const response = await app.inject({ method: 'GET', url: '/api/pos/v1/settings' });
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
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.saleEvent.findUnique.mockResolvedValue(null);
      mocks.prisma.saleEvent.create.mockResolvedValue({ id: 'evt-1' });
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }]);
      mocks.prisma.stockLedgerEntry.createMany.mockResolvedValue({ count: 2 });
      mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(mocks.prisma));
    });

    it('ingests a SALE_COMPLETED event and derives stock ledger entries', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey' },
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
      expect(mocks.prisma.stockLedgerEntry.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ productId: 'p-1', delta: -2, reason: 'POS_SALE', sourceType: 'SaleEvent', sourceId: 'evt-1' }),
          expect.objectContaining({ productId: 'p-2', variantId: 'v-1', delta: -1, reason: 'POS_SALE', sourceId: 'evt-1' }),
        ],
      });
      await app.close();
    });

    it('does not derive stock for a non-completing event type', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey' },
        payload: {
          ...validSaleEvent,
          eventType: 'SALE_PAID',
          idempotencyKey: 'dev-1:sale:SALE-000001:SALE_PAID',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.product.findMany).not.toHaveBeenCalled();
      expect(mocks.prisma.stockLedgerEntry.createMany).not.toHaveBeenCalled();
      await app.close();
    });

    it('accepts an unknown product with an UNKNOWN_PRODUCT warning and skips its ledger row', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey' },
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
      expect(mocks.prisma.stockLedgerEntry.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ productId: 'p-1', delta: -2 })],
      });
      await app.close();
    });

    it('flags a non-integer quantity with INVALID_QUANTITY and skips its ledger row', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey' },
        payload: {
          ...validSaleEvent,
          items: [{ productId: 'p-1', quantity: 1.5 }],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.warnings).toEqual([
        expect.objectContaining({ index: 0, code: 'INVALID_QUANTITY' }),
      ]);
      expect(mocks.prisma.stockLedgerEntry.createMany).not.toHaveBeenCalled();
      await app.close();
    });

    it('replays an identical duplicate with the stored result and no side effects', async () => {
      // First deliver the event for real to learn the exact payloadHash the
      // handler computes, then replay against a stored row with that hash.
      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey' },
        payload: validSaleEvent,
      });
      const storedHash = mocks.prisma.saleEvent.create.mock.calls[0][0].data.payloadHash;

      vi.clearAllMocks();
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.saleEvent.findUnique.mockResolvedValue({
        id: 'evt-1', payloadHash: storedHash, warnings: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey' },
        payload: validSaleEvent,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data).toEqual({ eventId: 'evt-1', warnings: [] });
      expect(mocks.prisma.saleEvent.create).not.toHaveBeenCalled();
      expect(mocks.prisma.stockLedgerEntry.createMany).not.toHaveBeenCalled();
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.stockEvent.findUnique.mockResolvedValue(null);
      mocks.prisma.stockEvent.create.mockResolvedValue({ id: 'stk-1' });
      mocks.prisma.product.findFirst.mockResolvedValue({ id: 'p-1' });
      mocks.prisma.stockLedgerEntry.create.mockResolvedValue({});
      mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(mocks.prisma));
    });

    it('ingests a RESTOCK event and derives a positive-delta ledger entry', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey' },
        payload: validStockEvent,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(typeof body.requestId).toBe('string');
      expect(body.data.eventId).toBe('stk-1');
      expect(body.data.warnings).toEqual([]);
      expect(mocks.prisma.stockLedgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'p-1', delta: 10, reason: 'RESTOCK',
          sourceType: 'StockEvent', sourceId: 'stk-1',
        }),
      });
      await app.close();
    });

    it('ingests a negative POS_ADJUSTMENT and keeps the signed delta', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey' },
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
      await app.close();
    });

    it('stores an unknown-product event with a warning and derives no ledger row', async () => {
      mocks.prisma.product.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey' },
        payload: { ...validStockEvent, productId: 'p-ghost' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.warnings).toEqual([
        expect.objectContaining({ index: 0, code: 'UNKNOWN_PRODUCT', productId: 'p-ghost' }),
      ]);
      expect(mocks.prisma.stockEvent.create).toHaveBeenCalled();
      expect(mocks.prisma.stockLedgerEntry.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects reason POS_SALE with 400 VALIDATION_ERROR', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey' },
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
        headers: { authorization: 'Bearer pos_validkey' },
        payload: validStockEvent,
      });
      const storedHash = mocks.prisma.stockEvent.create.mock.calls[0][0].data.payloadHash;

      vi.clearAllMocks();
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.stockEvent.findUnique.mockResolvedValue({
        id: 'stk-1', payloadHash: storedHash, warnings: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/stock-events',
        headers: { authorization: 'Bearer pos_validkey' },
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        headers: { authorization: 'Bearer pos_validkey' },
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
        payload: validStockEvent,
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('still-stubbed endpoints', () => {
    const cases: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'POST', url: '/api/pos/v1/fiscal-events' },
      { method: 'POST', url: '/api/pos/v1/shift-events' },
      { method: 'GET', url: '/api/pos/v1/commands' },
      { method: 'POST', url: '/api/pos/v1/commands/cmd-1/ack' },
    ];

    for (const { method, url } of cases) {
      it(`${method} ${url} still returns 501 Not Implemented`, async () => {
        const app = await buildApp();
        const response = await app.inject({ method, url });

        expect(response.statusCode).toBe(501);
        expect(response.json()).toMatchObject({ success: false, error: 'NOT_IMPLEMENTED' });
        await app.close();
      });
    }
  });
});
