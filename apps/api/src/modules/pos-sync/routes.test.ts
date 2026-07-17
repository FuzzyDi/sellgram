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
    platformPolicy: { findMany: vi.fn().mockResolvedValue([]) },
    platformPolicyVersion: { findFirst: vi.fn().mockResolvedValue({ version: 1 }) },
    posOperator: { findMany: vi.fn().mockResolvedValue([]) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ planExpiresAt: null, blockedAt: null }) },
    saleEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    customer: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    loyaltyConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    loyaltyTransaction: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue(null) },
    stockEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ stockQty: 0 }),
    },
    productType: { findMany: vi.fn().mockResolvedValue([]) },
    productVariant: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ stockQty: 0 }),
    },
    stockLedgerEntry: { createMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn().mockResolvedValue({}) },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    fiscalEvent: { create: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null) },
    shiftEvent: { create: vi.fn().mockResolvedValue({}) },
    posOperatorEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    posPaymentEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    paymentTerminal: { findMany: vi.fn().mockResolvedValue([]) },
    posDeviceSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    cloudCommand: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(),
  },
  // docs/POS_SETTINGS_ARCHITECTURE.md §5 — routes.ts imports
  // decryptSecrets from admin-routes.js, which itself imports
  // encrypt/decrypt; mocked here for the same determinism reasons as
  // admin-routes.test.ts.
  decrypt: vi.fn((value: string) => `decrypted(${value})`),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../lib/encrypt.js', () => ({ encrypt: vi.fn((v: string) => v), decrypt: mocks.decrypt }));

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
    deviceCode: 'code-1',
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
        { id: 'dev-1', tenantId: 't-1', storeId: 's-1', deviceCode: 'code-1' },
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
      expect(body.data.deviceCode).toBe('code-1');
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
        device: { id: 'dev-1', tenantId: 't-1' },
      });
      // First findFirst call is the fingerprint check (collision found);
      // the second is the deviceCode check (no collision, default null).
      mocks.prisma.posDevice.findFirst.mockResolvedValueOnce({ id: 'dev-other' });
      mocks.prisma.$transaction.mockResolvedValue([
        { id: 'dev-1', tenantId: 't-1', storeId: 's-1', deviceCode: 'code-1' },
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

    it('rejects activation with 409 DEVICE_CODE_ALREADY_IN_USE when another active device in the same tenant already holds this deviceCode', async () => {
      mocks.prisma.deviceActivation.findUnique.mockResolvedValue({
        id: 'act-1',
        deviceId: 'dev-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        device: { id: 'dev-1', tenantId: 't-1' },
      });
      // First call: fingerprint check, no collision. Second call:
      // deviceCode check, collision with a genuinely different device.
      mocks.prisma.posDevice.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'dev-other', deviceCode: 'code-1' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/activate',
        payload: validActivatePayload,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('DEVICE_CODE_ALREADY_IN_USE');
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });

    it('does not block re-activation when the deviceCode collision check correctly excludes the device being activated', async () => {
      mocks.prisma.deviceActivation.findUnique.mockResolvedValue({
        id: 'act-1',
        deviceId: 'dev-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        device: { id: 'dev-1', tenantId: 't-1' },
      });
      // Both findFirst calls resolve null — in a real DB, the deviceCode
      // check's `id: { not: activation.deviceId }` clause means the
      // device's own (about-to-be-overwritten) row is never a collision
      // with itself, even if it already happened to hold this deviceCode.
      mocks.prisma.posDevice.findFirst.mockResolvedValue(null);
      mocks.prisma.$transaction.mockResolvedValue([
        { id: 'dev-1', tenantId: 't-1', storeId: 's-1', deviceCode: 'code-1' },
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
      // The second findFirst call is the deviceCode check — assert it
      // excludes the device currently being activated.
      expect(mocks.prisma.posDevice.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 't-1',
            deviceCode: 'code-1',
            status: 'ACTIVE',
            id: { not: 'dev-1' },
          }),
        })
      );
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when deviceCode is missing', async () => {
      const { deviceCode: _omit, ...payload } = validActivatePayload;
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/api/pos/v1/activate', payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
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
      const warnLine = lines.find((l) => l.includes('mismatched credentials'));
      expect(warnLine).toBeTruthy();
      // Both the request's (wrong) deviceCode and the resolved device's
      // real one must be present — not just "something mismatched".
      expect(warnLine).toContain('wrong-code');
      expect(warnLine).toContain('code-1');
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
      expect(body.data.pendingCommandsCount).toBe(0);
      await app.close();
    });

    it('reports hasCommands: true and the real count when PENDING CloudCommand rows exist for this device', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.tenant.findUnique.mockResolvedValue({ planExpiresAt: null, blockedAt: null });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({ version: 4 });
      mocks.prisma.posSettings.findUnique.mockResolvedValueOnce({ version: 7 });
      mocks.prisma.cloudCommand.count.mockResolvedValueOnce(3);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validHeartbeatPayload,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.hasCommands).toBe(true);
      expect(body.data.pendingCommandsCount).toBe(3);
      expect(mocks.prisma.cloudCommand.count).toHaveBeenCalledWith({ where: { deviceId: 'dev-1', status: 'PENDING' } });
      await app.close();
    });

    it('clears alertSentAt on heartbeat (resets jobs/pos-device-monitor.ts\'s offline-alert dedup flag)', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.tenant.findUnique.mockResolvedValue({ planExpiresAt: null, blockedAt: null });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({ version: 1 });
      mocks.prisma.posSettings.findUnique.mockResolvedValueOnce({ version: 1 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validHeartbeatPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.posDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dev-1' },
          data: expect.objectContaining({ lastSeenAt: expect.any(Date), alertSentAt: null }),
        })
      );
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

  describe('GET /api/pos/v1/products/search', () => {
    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.product.findMany.mockResolvedValue([]);
      mocks.prisma.productType.findMany.mockResolvedValue([]);
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue(null);
    });

    const sampleProduct = {
      id: 'p-1', name: 'Cola 0.5L', sku: 'COLA-05', price: 12000, currency: 'UZS',
      stockQty: 10, categoryId: 'c-1', vatRate: null, vatExempt: false, markType: null,
      isMarked: false, mxikCode: '01234567890123456', packageCode: null, unit: 'шт',
      isByWeight: false, isWeightedPiece: false, pluCode: null, pricePerKg: null,
      updatedAt: new Date('2026-07-01T00:00:00Z'),
      barcodes: [{ id: 'b-1', barcode: '4780000000017', type: 'EAN13', isDefault: true, unitQty: 1, variantId: null }],
      variants: [],
      productTypeId: null,
      productType: null,
    };

    it('returns 400 when q is shorter than 2 characters', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/products/search?q=a',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(mocks.prisma.product.findMany).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when q is missing entirely', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/products/search',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 401 for a missing device key', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/products/search?q=cola',
        headers: { 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('searches by name/sku/mxikCode (ILIKE) and exact barcode, scoped to the tenant and active products only', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([sampleProduct]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/products/search?q=cola&limit=10',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 't-1',
            isActive: true,
            OR: [
              { name: { contains: 'cola', mode: 'insensitive' } },
              { sku: { contains: 'cola', mode: 'insensitive' } },
              { mxikCode: { contains: 'cola', mode: 'insensitive' } },
              { barcodes: { some: { tenantId: 't-1', barcode: 'cola' } } },
            ],
          },
          take: 10,
        })
      );
      const body = response.json();
      expect(body.data.products).toHaveLength(1);
      expect(body.data.products[0]).toMatchObject({
        id: 'p-1', name: 'Cola 0.5L', sku: 'COLA-05',
        productTypeCode: null, productTypeRules: [], weightMode: 'PIECE', barcodePrefixes: [],
      });
      expect(body.data.products[0].barcodes).toEqual(sampleProduct.barcodes);
      await app.close();
    });

    it('defaults limit to 20 when not provided, caps at 50', async () => {
      const app = await buildApp();
      await app.inject({
        method: 'GET',
        url: '/api/pos/v1/products/search?q=cola',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });
      expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/products/search?q=cola&limit=999',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('derives productTypeCode/productTypeRules/weightMode/barcodePrefixes the same way CatalogSnapshot does', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([{
        ...sampleProduct,
        isByWeight: true,
        productTypeId: 'pt-1',
        productType: { code: 'WEIGHT', rules: [], weightMode: 'WEIGHT', barcodePrefixes: ['22'], parentTypeId: null },
      }]);
      mocks.prisma.productType.findMany.mockResolvedValue([
        { id: 'pt-1', rules: [{ ruleId: 'WEIGHT_REQUIRED', severity: 'BLOCK', channels: ['POS'] }], parentTypeId: null },
      ]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/products/search?q=cola',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      const product = response.json().data.products[0];
      expect(product.productTypeCode).toBe('WEIGHT');
      expect(product.productTypeRules).toEqual([{ ruleId: 'WEIGHT_REQUIRED', severity: 'BLOCK', channels: ['POS'] }]);
      expect(product.weightMode).toBe('WEIGHT');
      expect(product.barcodePrefixes).toEqual(['22']);
      // The raw nested productType object is stripped, matching
      // admin-routes.ts's snapshot shape (flat fields only).
      expect(product.productType).toBeUndefined();
      await app.close();
    });

    it('returns catalogVersion from the latest CatalogSnapshot for the device store', async () => {
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({ version: 7 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/products/search?q=cola',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.json().data.catalogVersion).toBe(7);
      expect(mocks.prisma.catalogSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't-1', storeId: 's-1' } })
      );
      await app.close();
    });

    it('returns catalogVersion: 0 when the store has no snapshot yet', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/products/search?q=cola',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });
      expect(response.json().data.catalogVersion).toBe(0);
      await app.close();
    });
  });

  describe('GET /api/pos/v1/settings', () => {
    const samplePlatformRule = {
      id: 'plt-1',
      scope: 'PAYMENT',
      severity: 'BLOCK',
      enabled: true,
      match: { categorySlugs: ['tobacco', 'alcohol'] },
      extra: { denyPayments: ['CASH'] },
      message: { ru: 'ru-text', uz: 'uz-text' },
    };

    it('serves the stored PosSettings document under the new settingsVersion/policies/printTemplates shape', async () => {
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
      const printTemplates = { autoPrintReceipt: true, printCopies: { sale: 1 } };
      const tenantRule = {
        id: 'cly-1',
        scope: 'DISCOUNT',
        severity: 'REQUIRE_MANAGER',
        enabled: true,
        match: { discountPercentAbove: 20 },
        message: { ru: 'ru-text', uz: 'uz-text' },
      };
      mocks.prisma.posSettings.findUnique.mockResolvedValue({
        version: 4,
        payload,
        policiesVersion: 2,
        tenantPolicyRules: [tenantRule],
        printTemplatesVersion: 3,
        printTemplates,
        staffVersion: 6,
      });
      mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 5 });
      mocks.prisma.platformPolicy.findMany.mockResolvedValue([samplePlatformRule]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.requestId).toBe('string');
      expect(body.data.settingsVersion).toBe(4);
      expect(body.data.printTemplatesVersion).toBe(3);
      expect(body.data.staffVersion).toBe(6);
      // policiesVersion is a computed sum: PlatformPolicyVersion.version (5)
      // + PosSettings.policiesVersion (2).
      expect(body.data.policiesVersion).toBe(7);
      expect(body.data.settings).toEqual(payload);
      expect(body.data.printTemplates).toEqual(printTemplates);
      expect(body.data.policies.rules).toEqual([
        {
          id: 'plt-1',
          scope: 'PAYMENT',
          source: 'PLATFORM',
          severity: 'BLOCK',
          enabled: true,
          match: { categorySlugs: ['tobacco', 'alcohol'] },
          denyPayments: ['CASH'],
          message: { ru: 'ru-text', uz: 'uz-text' },
        },
        { ...tenantRule, source: 'TENANT' },
      ]);
      // Query-level filter, not application-code filter — asserted
      // directly since it's the mechanism §7 relies on.
      expect(mocks.prisma.platformPolicy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { enabled: true } })
      );
      await app.close();
    });

    it('serves empty eight-key defaults plus storeTimezone, empty printTemplates, and version 1 for all three counters when no PosSettings row exists — but still includes enabled platform rules', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.posSettings.findUnique.mockResolvedValue(null);
      mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
      mocks.prisma.platformPolicy.findMany.mockResolvedValue([samplePlatformRule]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.settingsVersion).toBe(1);
      expect(body.data.printTemplatesVersion).toBe(1);
      expect(body.data.staffVersion).toBe(1);
      expect(body.data.staff).toBeNull();
      expect(body.data.policiesVersion).toBe(2);
      expect(body.data.settings).toEqual({
        taxProfile: {},
        paymentMethods: [],
        receiptTemplate: {},
        printerProfile: {},
        fiscalProfile: {},
        offlineLimits: {},
        roundingRules: {},
        featureFlags: {},
        // §6 — hardcoded for UZ; a sibling of the other settings keys.
        storeTimezone: 'Asia/Tashkent',
        // docs/POS_SETTINGS_ARCHITECTURE.md §4 — empty when the store has
        // no PaymentTerminal rows at all (mocked paymentTerminal.findMany
        // returns [] by default in this suite).
        paymentProviders: {},
        // docs/POS_SETTINGS_ARCHITECTURE.md §6/§10 — all null when this
        // device has no PosDeviceSettings row (mocked findUnique
        // returns null by default in this suite). deviceSettings is
        // canonical; hardware is the deprecated alias, same object.
        // pinpad is canonical, pinPad the deprecated alias within it.
        deviceSettings: { printer: null, scanner: null, pinpad: null, pinPad: null, scale: null, display: null },
        hardware: { printer: null, scanner: null, pinpad: null, pinPad: null, scale: null, display: null },
      });
      expect(body.data.deviceSettingsVersion).toBe(0);
      expect(body.data.printTemplates).toEqual({});
      // §6 — "An unconfigured store's policies.rules is never empty in
      // practice": the platform rule is present even with no PosSettings
      // row and no tenant rules at all.
      expect(body.data.policies.rules).toHaveLength(1);
      expect(body.data.policies.rules[0]).toMatchObject({ id: 'plt-1', source: 'PLATFORM' });
      await app.close();
    });

    it('never sends a disabled PlatformPolicy row to the till', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.posSettings.findUnique.mockResolvedValue(null);
      mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
      // The query itself filters on enabled: true — this test only proves
      // the route trusts that filter and doesn't re-add a disabled row.
      mocks.prisma.platformPolicy.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.json().data.policies.rules).toEqual([]);
      await app.close();
    });

    it('force-overwrites source:TENANT on a tenantPolicyRules element even if the stored JSON claims source:PLATFORM', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      const spoofedRule = {
        id: 'cly-evil',
        scope: 'PAYMENT',
        source: 'PLATFORM',
        severity: 'BLOCK',
        enabled: true,
        match: {},
        message: { ru: '-', uz: '-' },
      };
      mocks.prisma.posSettings.findUnique.mockResolvedValue({
        version: 1,
        payload: {},
        policiesVersion: 1,
        tenantPolicyRules: [spoofedRule],
        printTemplatesVersion: 1,
        printTemplates: {},
      });
      mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
      mocks.prisma.platformPolicy.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      const rules = response.json().data.policies.rules;
      expect(rules).toHaveLength(1);
      expect(rules[0].source).toBe('TENANT');
      await app.close();
    });

    it('filters out a disabled tenantPolicyRules element', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.posSettings.findUnique.mockResolvedValue({
        version: 1,
        payload: {},
        policiesVersion: 1,
        tenantPolicyRules: [
          { id: 'cly-disabled', scope: 'SALE', enabled: false, match: {}, message: { ru: '-', uz: '-' } },
        ],
        printTemplatesVersion: 1,
        printTemplates: {},
      });
      mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
      mocks.prisma.platformPolicy.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.json().data.policies.rules).toEqual([]);
      await app.close();
    });

    it('returns staff: null when the store has no active PosOperator rows', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.posSettings.findUnique.mockResolvedValue(null);
      mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
      mocks.prisma.platformPolicy.findMany.mockResolvedValue([]);
      mocks.prisma.posOperator.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.json().data.staff).toBeNull();
      await app.close();
    });

    it('includes active operators sorted by name with lowercase role on the wire, and queries only active: true for this store', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.posSettings.findUnique.mockResolvedValue(null);
      mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
      mocks.prisma.platformPolicy.findMany.mockResolvedValue([]);
      mocks.prisma.posOperator.findMany.mockResolvedValue([
        { id: 'op-1', name: 'Alice', role: 'SENIOR_CASHIER', permissions: ['void_sale'], active: true },
        { id: 'op-2', name: 'Bob', role: 'ADMIN', permissions: [], active: true },
      ]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      const body = response.json();
      expect(body.data.staff).toEqual({
        operators: [
          { id: 'op-1', name: 'Alice', role: 'senior_cashier', permissions: ['void_sale'], active: true, pinHashSha256: null, pinSalt: null },
          { id: 'op-2', name: 'Bob', role: 'admin', permissions: [], active: true, pinHashSha256: null, pinSalt: null },
        ],
      });
      // Query-level filter, not application-code filter, and store-scoped —
      // mirrors the platformPolicy.findMany assertion above.
      expect(mocks.prisma.posOperator.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't-1', storeId: 's-1', active: true },
          orderBy: { name: 'asc' },
          select: expect.objectContaining({ pinRequired: true, pinHashSha256: true, pinSalt: true }),
        })
      );
      await app.close();
    });

    // docs/POS_POLICY_ENGINE.md §14.1 — offline-first: the till verifies
    // a PIN locally, with no server round-trip, so pinHashSha256/pinSalt
    // travel with the rest of the staff roster (deliberate tradeoff, see
    // the schema comment on PosOperator.pinRequired).
    it('includes pinRequired, pinHashSha256, and pinSalt per operator for offline PIN verification', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.posSettings.findUnique.mockResolvedValue(null);
      mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
      mocks.prisma.platformPolicy.findMany.mockResolvedValue([]);
      mocks.prisma.posOperator.findMany.mockResolvedValue([
        {
          id: 'op-1', name: 'Alice', role: 'CASHIER', permissions: [], active: true, pinRequired: true,
          pinHashSha256: 'deadbeef', pinSalt: 'cafebabe',
        },
        {
          id: 'op-2', name: 'Bob', role: 'CASHIER', permissions: [], active: true, pinRequired: false,
          pinHashSha256: null, pinSalt: null,
        },
      ]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      const [op1, op2] = response.json().data.staff.operators;
      expect(op1).toMatchObject({ pinRequired: true, pinHashSha256: 'deadbeef', pinSalt: 'cafebabe' });
      // Backward compat: an operator with no PIN set gets pinRequired:
      // false and both fields null, not omitted.
      expect(op2).toMatchObject({ pinRequired: false, pinHashSha256: null, pinSalt: null });
      await app.close();
    });

    // docs/POS_SETTINGS_ARCHITECTURE.md §4 — server-side store/device
    // merge for settings.paymentProviders.
    describe('settings.paymentProviders (docs/POS_SETTINGS_ARCHITECTURE.md §4)', () => {
      beforeEach(() => {
        mocks.prisma.posDevice.findUnique.mockResolvedValue({
          id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
        });
        mocks.prisma.posSettings.findUnique.mockResolvedValue(null);
        mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
        mocks.prisma.platformPolicy.findMany.mockResolvedValue([]);
        mocks.prisma.posOperator.findMany.mockResolvedValue([]);
      });

      it('builds paymentProviders from store-level terminals with scope STORE', async () => {
        mocks.prisma.paymentTerminal.findMany
          .mockResolvedValueOnce([
            { type: 'QR_UZQR', deviceId: null, config: { url: 'https://uzqr.uz', apiKey: 'secret' } },
          ])
          .mockResolvedValueOnce([]);

        const app = await buildApp();
        const response = await app.inject({
          method: 'GET',
          url: '/api/pos/v1/settings',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        });

        expect(response.json().data.settings.paymentProviders).toEqual({
          uzQr: { enabled: true, url: 'https://uzqr.uz', apiKey: 'secret', scope: 'STORE' },
        });
        await app.close();
      });

      // docs/POS_SETTINGS_ARCHITECTURE.md §5 — the till needs the real
      // working apiKey, so a stored (encrypted) secret must come back
      // decrypted here, unlike every admin-facing response.
      it('decrypts an encrypted apiKey before sending it to the device', async () => {
        const ciphertext = `${'a'.repeat(32)}:deadbeef:${'b'.repeat(32)}`;
        mocks.prisma.paymentTerminal.findMany
          .mockResolvedValueOnce([
            { type: 'QR_UZQR', deviceId: null, config: { url: 'https://uzqr.uz', apiKey: ciphertext } },
          ])
          .mockResolvedValueOnce([]);

        const app = await buildApp();
        const response = await app.inject({
          method: 'GET',
          url: '/api/pos/v1/settings',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        });

        expect(mocks.decrypt).toHaveBeenCalledWith(ciphertext);
        expect(response.json().data.settings.paymentProviders.uzQr.apiKey).toBe(`decrypted(${ciphertext})`);
        await app.close();
      });

      it('a device-level terminal overrides a store-level terminal of the same type, scope DEVICE', async () => {
        mocks.prisma.paymentTerminal.findMany
          .mockResolvedValueOnce([{ type: 'CASH', deviceId: null, config: { note: 'store default' } }])
          .mockResolvedValueOnce([{ type: 'CASH', deviceId: 'dev-1', config: { note: 'this till only' } }]);

        const app = await buildApp();
        const response = await app.inject({
          method: 'GET',
          url: '/api/pos/v1/settings',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        });

        expect(response.json().data.settings.paymentProviders).toEqual({
          cash: { enabled: true, note: 'this till only', scope: 'DEVICE' },
        });
        await app.close();
      });

      it('skips a type with no known paymentProviders key', async () => {
        mocks.prisma.paymentTerminal.findMany
          .mockResolvedValueOnce([{ type: 'SOME_FUTURE_TYPE', deviceId: null, config: {} }])
          .mockResolvedValueOnce([]);

        const app = await buildApp();
        const response = await app.inject({
          method: 'GET',
          url: '/api/pos/v1/settings',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        });

        expect(response.json().data.settings.paymentProviders).toEqual({});
        await app.close();
      });
    });

    describe('settings.deviceSettings / settings.hardware (docs/POS_SETTINGS_ARCHITECTURE.md §6/§10)', () => {
      beforeEach(() => {
        mocks.prisma.posDevice.findUnique.mockResolvedValue({
          id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
        });
        mocks.prisma.posSettings.findUnique.mockResolvedValue(null);
        mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ version: 1 });
        mocks.prisma.platformPolicy.findMany.mockResolvedValue([]);
        mocks.prisma.posOperator.findMany.mockResolvedValue([]);
      });

      it('reports null for every field, and deviceSettingsVersion: 0, when this device has no PosDeviceSettings row', async () => {
        mocks.prisma.posDeviceSettings.findUnique.mockResolvedValue(null);

        const app = await buildApp();
        const response = await app.inject({
          method: 'GET',
          url: '/api/pos/v1/settings',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        });

        const expected = { printer: null, scanner: null, pinpad: null, pinPad: null, scale: null, display: null };
        expect(response.json().data.settings.deviceSettings).toEqual(expected);
        // hardware is a deprecated alias of the exact same object.
        expect(response.json().data.settings.hardware).toEqual(expected);
        expect(response.json().data.deviceSettingsVersion).toBe(0);
        await app.close();
      });

      it('reports the configured profile under both pinpad (canonical) and pinPad (deprecated alias), queried by deviceId', async () => {
        const updatedAt = new Date('2026-07-18T12:00:00Z');
        mocks.prisma.posDeviceSettings.findUnique.mockResolvedValue({
          printer: { type: 'THERMAL', paperWidth: 58 },
          scanner: null,
          pinPad: { protocol: 'NEXGO', port: '/dev/ttyUSB0' },
          scale: null,
          display: null,
          updatedAt,
        });

        const app = await buildApp();
        const response = await app.inject({
          method: 'GET',
          url: '/api/pos/v1/settings',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        });

        const expected = {
          printer: { type: 'THERMAL', paperWidth: 58 },
          scanner: null,
          pinpad: { protocol: 'NEXGO', port: '/dev/ttyUSB0' },
          pinPad: { protocol: 'NEXGO', port: '/dev/ttyUSB0' },
          scale: null,
          display: null,
        };
        expect(response.json().data.settings.deviceSettings).toEqual(expected);
        expect(response.json().data.settings.hardware).toEqual(expected);
        expect(response.json().data.deviceSettingsVersion).toBe(Math.floor(updatedAt.getTime() / 1000));
        expect(mocks.prisma.posDeviceSettings.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { deviceId: 'dev-1' } })
        );
        await app.close();
      });
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

  // docs/CUSTOMER_LOYALTY.md §5/§13 step 2.
  describe('GET /api/pos/v1/customer', () => {
    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      // Explicit reset: vi.clearAllMocks() (outer beforeEach) clears call
      // history but NOT a prior test's mockResolvedValue — without this,
      // a later test in this block would silently inherit an earlier
      // test's resolved value.
      mocks.prisma.customer.findFirst.mockResolvedValue(null);
      mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue(null);
    });

    it('finds a customer by loyaltyCard and returns loyaltyLevel from the tenant tier config', async () => {
      mocks.prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-1', firstName: 'Alice', lastName: null, phone: '+998901234567',
        telegramUser: null, loyaltyPoints: 1240, loyaltyCardNumber: 'LC000123', totalSpent: 600000,
      });
      mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ tiers: null });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/customer?loyaltyCard=LC000123',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toEqual(
        expect.objectContaining({ id: 'cust-1', name: 'Alice', loyaltyCardNumber: 'LC000123', loyaltyLevel: 'Silver' })
      );
      expect(mocks.prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't-1', loyaltyCardNumber: 'LC000123' } })
      );
      await app.close();
    });

    it('finds a customer by phone', async () => {
      mocks.prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-2', firstName: 'Bob', lastName: null, phone: '+998900000000',
        telegramUser: null, loyaltyPoints: 0, loyaltyCardNumber: 'LC000456', totalSpent: 0,
      });
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/customer?phone=%2B998900000000',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't-1', phone: '+998900000000' } })
      );
      await app.close();
    });

    it('returns loyaltyLevel: null when the tenant has no LoyaltyConfig row at all', async () => {
      mocks.prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-1', firstName: 'Alice', lastName: null, phone: null,
        telegramUser: null, loyaltyPoints: 0, loyaltyCardNumber: 'LC000123', totalSpent: 0,
      });
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/customer?loyaltyCard=LC000123',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });
      expect(response.json().data.loyaltyLevel).toBeNull();
      await app.close();
    });

    it('returns 404 CUSTOMER_NOT_FOUND when nothing matches', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/customer?loyaltyCard=LC999999',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('CUSTOMER_NOT_FOUND');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when neither phone nor loyaltyCard is given', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/customer',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.customer.findFirst).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 401 for a missing device key', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/customer?loyaltyCard=LC000123',
        headers: { 'x-device-code': 'code-1' },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  // docs/CUSTOMER_LOYALTY.md §5/§13 step 2.
  describe('POST /api/pos/v1/customer', () => {
    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(mocks.prisma));
      mocks.prisma.customer.findUnique.mockResolvedValue(null); // no loyaltyCardNumber collision
    });

    it('creates a customer with telegramId null and a generated loyaltyCardNumber', async () => {
      mocks.prisma.customer.create.mockResolvedValue({
        id: 'cust-new', firstName: 'Cher', lastName: null, phone: '+998901112233', loyaltyCardNumber: 'LC777777',
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/customer',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { name: 'Cher', phone: '+998901112233' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.loyaltyCardNumber).toBe('LC777777');
      expect(mocks.prisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't-1',
            telegramId: null,
            firstName: 'Cher',
            phone: '+998901112233',
            loyaltyCardNumber: expect.stringMatching(/^LC\d{6}$/),
          }),
        })
      );
      await app.close();
    });

    it('returns 400 when phone is missing', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/customer',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { name: 'Cher' },
      });
      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.customer.create).not.toHaveBeenCalled();
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
      policiesVersion: 3,
      triggeredRuleIds: ['plt-1'],
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
      // Explicit reset for the loyalty-accrual mocks (§7 below) — same
      // "mockResolvedValue survives vi.clearAllMocks()" reasoning as the
      // GET /api/pos/v1/customer block above; without this, a value left
      // over from an earlier describe block would leak in here.
      mocks.prisma.customer.findFirst.mockResolvedValue(null);
      mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue(null);
      mocks.prisma.customer.update.mockResolvedValue({});
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

    it('accepts a non-empty triggeredRuleIds and stores it verbatim alongside policiesVersion', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validSaleEvent, policiesVersion: 5, triggeredRuleIds: ['plt-1', 'cly-1'] },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.saleEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ policiesVersion: 5, triggeredRuleIds: ['plt-1', 'cly-1'] }),
        })
      );
      await app.close();
    });

    it('accepts an empty triggeredRuleIds array', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validSaleEvent, triggeredRuleIds: [] },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.saleEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ triggeredRuleIds: [] }) })
      );
      await app.close();
    });

    it('accepts a present managerOverride and stores it verbatim', async () => {
      const managerOverride = { managerId: 'mgr-1', overriddenAtMs: 1783350000000 };
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validSaleEvent, managerOverride },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.saleEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ managerOverride }) })
      );
      await app.close();
    });

    it('accepts an absent managerOverride (stored as null)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validSaleEvent,
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.saleEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ managerOverride: null }) })
      );
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when policiesVersion is missing', async () => {
      const { policiesVersion: _omit, ...payload } = validSaleEvent;
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

    it('returns 400 VALIDATION_ERROR when triggeredRuleIds is missing', async () => {
      const { triggeredRuleIds: _omit, ...payload } = validSaleEvent;
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

    it('returns 400 VALIDATION_ERROR when policiesVersion is negative', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validSaleEvent, policiesVersion: -1 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when policiesVersion is not an integer', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validSaleEvent, policiesVersion: 1.5 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    // docs/CUSTOMER_LOYALTY.md §7 (revised) — loyalty accrual moved to
    // POST /pos/v1/fiscal-events (its own describe block below). This is
    // a narrow regression guard: sale-events must never accrue again,
    // even though it still stores customerId on the row itself (§7's
    // customer-identification purpose for that field is unchanged).
    it('does not accrue loyalty itself (moved to fiscal-events, §7 revised)', async () => {
      mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null });
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/sale-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validSaleEvent, customerId: 'cust-1' },
      });
      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.saleEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ customerId: 'cust-1' }) })
      );
      expect(mocks.prisma.loyaltyConfig.findUnique).not.toHaveBeenCalled();
      expect(mocks.prisma.customer.update).not.toHaveBeenCalled();
      expect(mocks.prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
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
      policiesVersion: 3,
      triggeredRuleIds: ['plt-1'],
    };

    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.fiscalEvent.create.mockResolvedValue({});
      mocks.prisma.fiscalEvent.findUnique.mockResolvedValue(null);
      mocks.prisma.fiscalEvent.findFirst.mockResolvedValue(null);
      mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(mocks.prisma));
      // Explicit reset — mockResolvedValue survives vi.clearAllMocks(), so
      // without this a value left over from an earlier describe block
      // (sale-events, GET/POST /customer) would leak in here.
      mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue(null);
      mocks.prisma.customer.findFirst.mockResolvedValue(null);
      mocks.prisma.customer.update.mockResolvedValue({});
      mocks.prisma.loyaltyTransaction.findFirst.mockResolvedValue(null);
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

    it('accepts a non-empty triggeredRuleIds and stores it verbatim alongside policiesVersion', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validFiscalEvent, policiesVersion: 7, triggeredRuleIds: ['plt-1', 'cly-1'] },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.fiscalEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ policiesVersion: 7, triggeredRuleIds: ['plt-1', 'cly-1'] }),
      });
      await app.close();
    });

    it('accepts an empty triggeredRuleIds array', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validFiscalEvent, triggeredRuleIds: [] },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.fiscalEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ triggeredRuleIds: [] }),
      });
      await app.close();
    });

    it('accepts a present managerOverride and stores it verbatim', async () => {
      const managerOverride = { managerId: 'mgr-1', overriddenAtMs: 1783350000000 };
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validFiscalEvent, managerOverride },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.fiscalEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ managerOverride }),
      });
      await app.close();
    });

    it('accepts an absent managerOverride (stored as null)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validFiscalEvent,
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.fiscalEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ managerOverride: null }),
      });
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when policiesVersion is missing', async () => {
      const { policiesVersion: _omit, ...payload } = validFiscalEvent;
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

    it('returns 400 VALIDATION_ERROR when triggeredRuleIds is missing', async () => {
      const { triggeredRuleIds: _omit, ...payload } = validFiscalEvent;
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

    it('returns 400 VALIDATION_ERROR when policiesVersion is negative', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validFiscalEvent, policiesVersion: -1 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when policiesVersion is not an integer', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/fiscal-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validFiscalEvent, policiesVersion: 1.5 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    // docs/CUSTOMER_LOYALTY.md §7 (revised) — accrual moved here from
    // sale-events, keyed off FISCAL_SUCCESS + receiptType SALE +
    // fiscalStatus SUCCESS, since a receipt is only "real" once fiscalized.
    describe('loyalty accrual (docs/CUSTOMER_LOYALTY.md §7, revised)', () => {
      it('accrues points and writes a LoyaltyTransaction sourced from the fiscal event', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-1', eventType: 'FISCAL_SUCCESS', receiptType: 'SALE', fiscalStatus: 'SUCCESS',
          customerId: 'cust-1', totalAmount: 1250000, receiptNumber: '20260704-0001-0001',
        });
        mocks.prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', totalSpent: 0, loyaltyPoints: 10 });
        mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({
          isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null,
        });
        mocks.prisma.customer.update.mockResolvedValue({ loyaltyPoints: 35 });

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, customerId: 'cust-1' },
        });

        expect(response.statusCode).toBe(201);
        // 1250000 tiyin / 100 = 12500 UZS → floor(12500/1000)*1 = 12 points.
        expect(mocks.prisma.customer.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'cust-1' },
            data: expect.objectContaining({
              loyaltyPoints: { increment: 12 },
              totalSpent: { increment: 12500 },
              ordersCount: { increment: 1 },
            }),
          })
        );
        expect(mocks.prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: 'cust-1', tenantId: 't-1', type: 'EARN', points: 12, balanceAfter: 35,
              sourceType: 'POS_FISCAL', sourceId: 'fisc-1',
            }),
          })
        );
        await app.close();
      });

      it('does not accrue when customerId is absent (anonymous sale)', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-2', eventType: 'FISCAL_SUCCESS', receiptType: 'SALE', fiscalStatus: 'SUCCESS',
          customerId: null, totalAmount: 500000, receiptNumber: '1',
        });
        mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null });

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: validFiscalEvent,
        });

        expect(response.statusCode).toBe(201);
        expect(mocks.prisma.loyaltyConfig.findUnique).not.toHaveBeenCalled();
        expect(mocks.prisma.customer.update).not.toHaveBeenCalled();
        await app.close();
      });

      it('does not accrue (EARN) for a REFUND receipt', async () => {
        // loyaltyConfig defaults to null in this describe block's
        // beforeEach — the "loyalty reversal on refund" describe below
        // now legitimately calls loyaltyConfig.findUnique for a REFUND
        // event too (its own gate, not accrual's), so this test only
        // asserts accrual's own EARN-shaped side effects never happen —
        // not that loyaltyConfig is untouched, which is no longer true.
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-3', eventType: 'FISCAL_SUCCESS', receiptType: 'REFUND', fiscalStatus: 'SUCCESS',
          customerId: 'cust-1', totalAmount: 500000, receiptNumber: '1',
          originalLocalReceiptId: null, originalReceiptNumber: null, deviceId: 'dev-1',
        });

        const app = await buildApp();
        await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, receiptType: 'REFUND', customerId: 'cust-1' },
        });

        expect(mocks.prisma.customer.update).not.toHaveBeenCalled();
        expect(mocks.prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
        await app.close();
      });

      it('does not accrue when fiscalStatus is not SUCCESS', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-4', eventType: 'FISCAL_SUCCESS', receiptType: 'SALE', fiscalStatus: 'PENDING',
          customerId: 'cust-1', totalAmount: 500000, receiptNumber: '1',
        });

        const app = await buildApp();
        await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, fiscalStatus: 'PENDING', customerId: 'cust-1' },
        });

        expect(mocks.prisma.loyaltyConfig.findUnique).not.toHaveBeenCalled();
        expect(mocks.prisma.customer.update).not.toHaveBeenCalled();
        await app.close();
      });

      it('skips accrual when a LoyaltyTransaction already exists for this fiscal event (idempotency)', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-5', eventType: 'FISCAL_SUCCESS', receiptType: 'SALE', fiscalStatus: 'SUCCESS',
          customerId: 'cust-1', totalAmount: 500000, receiptNumber: '1',
        });
        mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null });
        mocks.prisma.loyaltyTransaction.findFirst.mockResolvedValue({ id: 'ltx-existing' });

        const app = await buildApp();
        await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, customerId: 'cust-1' },
        });

        expect(mocks.prisma.loyaltyTransaction.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { sourceType: 'POS_FISCAL', sourceId: 'fisc-5' } })
        );
        expect(mocks.prisma.customer.update).not.toHaveBeenCalled();
        expect(mocks.prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
        await app.close();
      });

      it('re-attempts accrual on a P2002 replay, using the row found via findUnique', async () => {
        mocks.prisma.fiscalEvent.create.mockRejectedValue(Object.assign(new Error('unique violation'), { code: 'P2002' }));
        mocks.prisma.fiscalEvent.findUnique.mockResolvedValue({
          id: 'fisc-6', eventType: 'FISCAL_SUCCESS', receiptType: 'SALE', fiscalStatus: 'SUCCESS',
          customerId: 'cust-1', totalAmount: 500000, receiptNumber: '1',
        });
        mocks.prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', totalSpent: 0, loyaltyPoints: 0 });
        mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null });
        mocks.prisma.customer.update.mockResolvedValue({ loyaltyPoints: 5 });

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, customerId: 'cust-1' },
        });

        expect(response.statusCode).toBe(200); // replay ack, not a new create
        expect(mocks.prisma.fiscalEvent.findUnique).toHaveBeenCalledWith({
          where: { deviceId_eventId: { deviceId: 'dev-1', eventId: validFiscalEvent.eventId } },
        });
        expect(mocks.prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ sourceId: 'fisc-6' }) })
        );
        await app.close();
      });

      it('logs the error and still returns success when accrual throws', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-7', eventType: 'FISCAL_SUCCESS', receiptType: 'SALE', fiscalStatus: 'SUCCESS',
          customerId: 'cust-1', totalAmount: 500000, receiptNumber: '1',
        });
        mocks.prisma.loyaltyConfig.findUnique.mockRejectedValue(new Error('db exploded'));

        const lines: string[] = [];
        const stream = new Writable({ write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); } });
        const app = await buildApp({ logger: { level: 'error', stream } });

        const response = await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, customerId: 'cust-1' },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({ success: true, requestId: expect.any(String) });
        const errorLine = lines.find((l) => l.includes('loyalty accrual/reversal failed'));
        expect(errorLine).toBeTruthy();
        expect(errorLine).toContain('fisc-7');
        await app.close();
      });
    });

    // docs/CUSTOMER_LOYALTY.md §7 — loyalty reversal on refund.
    describe('loyalty reversal on refund', () => {
      it('deducts points using the base (non-tiered) formula and writes an ADJUST LoyaltyTransaction', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-refund-1', eventType: 'FISCAL_SUCCESS', receiptType: 'REFUND', fiscalStatus: 'SUCCESS',
          customerId: 'cust-1', totalAmount: 1250000, receiptNumber: '20260704-0001-0002',
          originalLocalReceiptId: null, originalReceiptNumber: null, deviceId: 'dev-1',
        });
        mocks.prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', totalSpent: 50000, loyaltyPoints: 100 });
        mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null });
        mocks.prisma.customer.update.mockResolvedValue({ loyaltyPoints: 88 });

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, receiptType: 'REFUND', customerId: 'cust-1' },
        });

        expect(response.statusCode).toBe(201);
        // 1250000 tiyin / 100 = 12500 UZS → floor(12500/1000)*1 = 12 points.
        expect(mocks.prisma.customer.update).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'cust-1' }, data: { loyaltyPoints: { decrement: 12 } } })
        );
        expect(mocks.prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: 'cust-1', tenantId: 't-1', type: 'ADJUST', points: -12, balanceAfter: 88,
              sourceType: 'POS_FISCAL_REFUND', sourceId: 'fisc-refund-1',
            }),
          })
        );
        // Refund reversal never touches totalSpent/ordersCount — only
        // the loyaltyPoints decrement above.
        await app.close();
      });

      it('clamps the deduction to the customer\'s current balance instead of going negative', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-refund-2', eventType: 'FISCAL_SUCCESS', receiptType: 'REFUND', fiscalStatus: 'SUCCESS',
          customerId: 'cust-1', totalAmount: 1250000, receiptNumber: '1',
          originalLocalReceiptId: null, originalReceiptNumber: null, deviceId: 'dev-1',
        });
        mocks.prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', totalSpent: 0, loyaltyPoints: 5 });
        mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null });
        mocks.prisma.customer.update.mockResolvedValue({ loyaltyPoints: 0 });

        const app = await buildApp();
        await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, receiptType: 'REFUND', customerId: 'cust-1' },
        });

        // basePoints would be 12, but the customer only has 5 — clamp to 5.
        expect(mocks.prisma.customer.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { loyaltyPoints: { decrement: 5 } } })
        );
        expect(mocks.prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ points: -5 }) })
        );
        await app.close();
      });

      it('falls back to the original SALE receipt\'s customerId via originalLocalReceiptId when the refund event has none', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-refund-3', eventType: 'FISCAL_SUCCESS', receiptType: 'REFUND', fiscalStatus: 'SUCCESS',
          customerId: null, totalAmount: 1250000, receiptNumber: '1',
          originalLocalReceiptId: 'sale-local-1', originalReceiptNumber: null, deviceId: 'dev-1',
        });
        mocks.prisma.fiscalEvent.findFirst.mockResolvedValue({ customerId: 'cust-orig' });
        mocks.prisma.customer.findFirst.mockResolvedValue({ id: 'cust-orig', totalSpent: 0, loyaltyPoints: 100 });
        mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null });
        mocks.prisma.customer.update.mockResolvedValue({ loyaltyPoints: 88 });

        const app = await buildApp();
        await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, receiptType: 'REFUND', originalLocalReceiptId: 'sale-local-1' },
        });

        expect(mocks.prisma.fiscalEvent.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { deviceId: 'dev-1', receiptType: 'SALE', eventType: 'FISCAL_SUCCESS', localReceiptId: 'sale-local-1' },
          })
        );
        expect(mocks.prisma.customer.update).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'cust-orig' }, data: { loyaltyPoints: { decrement: 12 } } })
        );
        await app.close();
      });

      it('does not reverse anything when neither the refund nor the original sale has a resolvable customerId', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-refund-4', eventType: 'FISCAL_SUCCESS', receiptType: 'REFUND', fiscalStatus: 'SUCCESS',
          customerId: null, totalAmount: 1250000, receiptNumber: '1',
          originalLocalReceiptId: null, originalReceiptNumber: null, deviceId: 'dev-1',
        });

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, receiptType: 'REFUND' },
        });

        expect(response.statusCode).toBe(201);
        expect(mocks.prisma.customer.update).not.toHaveBeenCalled();
        expect(mocks.prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
        await app.close();
      });

      it('is idempotent: skips reversal when a LoyaltyTransaction already exists for this fiscal event', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-refund-5', eventType: 'FISCAL_SUCCESS', receiptType: 'REFUND', fiscalStatus: 'SUCCESS',
          customerId: 'cust-1', totalAmount: 1250000, receiptNumber: '1',
          originalLocalReceiptId: null, originalReceiptNumber: null, deviceId: 'dev-1',
        });
        mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null });
        mocks.prisma.loyaltyTransaction.findFirst.mockResolvedValue({ id: 'ltx-existing' });

        const app = await buildApp();
        await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, receiptType: 'REFUND', customerId: 'cust-1' },
        });

        expect(mocks.prisma.loyaltyTransaction.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { sourceType: 'POS_FISCAL_REFUND', sourceId: 'fisc-refund-5' } })
        );
        expect(mocks.prisma.customer.update).not.toHaveBeenCalled();
        expect(mocks.prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
        await app.close();
      });

      it('does not accrue via accrueFiscalLoyalty for a REFUND receipt (mutually exclusive with accrual)', async () => {
        mocks.prisma.fiscalEvent.create.mockResolvedValue({
          id: 'fisc-refund-6', eventType: 'FISCAL_SUCCESS', receiptType: 'REFUND', fiscalStatus: 'SUCCESS',
          customerId: 'cust-1', totalAmount: 1250000, receiptNumber: '1',
          originalLocalReceiptId: null, originalReceiptNumber: null, deviceId: 'dev-1',
        });
        mocks.prisma.loyaltyConfig.findUnique.mockResolvedValue({ isEnabled: true, unitAmount: 1000, pointsPerUnit: 1, tiers: null });
        mocks.prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', totalSpent: 0, loyaltyPoints: 100 });
        mocks.prisma.customer.update.mockResolvedValue({ loyaltyPoints: 88 });

        const app = await buildApp();
        await app.inject({
          method: 'POST',
          url: '/api/pos/v1/fiscal-events',
          headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
          payload: { ...validFiscalEvent, receiptType: 'REFUND', customerId: 'cust-1' },
        });

        // Only the ADJUST reversal fires — no EARN row, and totalSpent/
        // ordersCount are never touched (accrual's increment shape).
        expect(mocks.prisma.loyaltyTransaction.create).toHaveBeenCalledTimes(1);
        expect(mocks.prisma.customer.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { loyaltyPoints: { decrement: 12 } } })
        );
        await app.close();
      });
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

  describe('POST /api/pos/v1/operator-events', () => {
    const validOperatorEvent = {
      eventType: 'OPERATOR_LOGIN',
      operatorId: 'op-1',
      actorId: null,
      idempotencyKey: 'code-1:operator:audit-1:OPERATOR_LOGIN',
      createdAt: 1732000000000,
      payload: { method: 'PIN' },
    };

    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.posOperatorEvent.findUnique.mockResolvedValue(null);
      mocks.prisma.posOperatorEvent.create.mockResolvedValue({
        id: 'opevt-1', eventType: 'OPERATOR_LOGIN', createdAt: new Date('2026-07-16T00:00:00Z'),
      });
    });

    it('ingests an OPERATOR_LOGIN event and folds createdAt into payload.deviceCreatedAtMs', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/operator-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validOperatorEvent,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(typeof body.requestId).toBe('string');
      expect(body.data).toEqual({
        id: 'opevt-1', eventType: 'OPERATOR_LOGIN', createdAt: '2026-07-16T00:00:00.000Z',
      });
      expect(mocks.prisma.posOperatorEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 't-1',
          storeId: 's-1',
          deviceId: 'dev-1',
          eventType: 'OPERATOR_LOGIN',
          operatorId: 'op-1',
          actorId: null,
          idempotencyKey: validOperatorEvent.idempotencyKey,
          payload: { method: 'PIN', deviceCreatedAtMs: 1732000000000 },
        }),
        select: { id: true, eventType: true, createdAt: true },
      });
      // The client-sent createdAt must never land on the row's own
      // createdAt column — that stays server-controlled (@default(now())).
      expect(mocks.prisma.posOperatorEvent.create.mock.calls[0][0].data.createdAt).toBeUndefined();
      await app.close();
    });

    it('accepts OPERATOR_LOCK with a null operatorId', async () => {
      mocks.prisma.posOperatorEvent.create.mockResolvedValue({
        id: 'opevt-2', eventType: 'OPERATOR_LOCK', createdAt: new Date('2026-07-16T00:00:00Z'),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/operator-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: {
          ...validOperatorEvent,
          eventType: 'OPERATOR_LOCK',
          operatorId: null,
          idempotencyKey: 'code-1:operator:audit-2:OPERATOR_LOCK',
          payload: { reason: 'IDLE_TIMEOUT' },
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.posOperatorEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'OPERATOR_LOCK', operatorId: null }) })
      );
      await app.close();
    });

    it('replays a duplicate idempotencyKey with the stored result and no new create', async () => {
      mocks.prisma.posOperatorEvent.findUnique.mockResolvedValue({
        id: 'opevt-1', eventType: 'OPERATOR_LOGIN', createdAt: new Date('2026-07-16T00:00:00Z'),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/operator-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validOperatorEvent,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual({
        id: 'opevt-1', eventType: 'OPERATOR_LOGIN', createdAt: '2026-07-16T00:00:00.000Z',
      });
      expect(mocks.prisma.posOperatorEvent.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('resolves a concurrent P2002 race by returning the winning row instead of erroring', async () => {
      mocks.prisma.posOperatorEvent.create.mockRejectedValue(
        Object.assign(new Error('unique violation'), { code: 'P2002' })
      );
      mocks.prisma.posOperatorEvent.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'opevt-1', eventType: 'OPERATOR_LOGIN', createdAt: new Date('2026-07-16T00:00:00Z') });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/operator-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validOperatorEvent,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual({
        id: 'opevt-1', eventType: 'OPERATOR_LOGIN', createdAt: '2026-07-16T00:00:00.000Z',
      });
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR for an unrecognized eventType', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/operator-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validOperatorEvent, eventType: 'OPERATOR_TELEPORTED' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(mocks.prisma.posOperatorEvent.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR for a malformed idempotencyKey', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/operator-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validOperatorEvent, idempotencyKey: 'not-the-right-shape' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('returns 401 without an Authorization header', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/operator-events',
        headers: { 'x-device-code': 'code-1' },
        payload: validOperatorEvent,
      });
      expect(response.statusCode).toBe(401);
      expect(mocks.prisma.posOperatorEvent.create).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('POST /api/pos/v1/payment-events', () => {
    const validPaymentEvent = {
      eventId: 'evt-uuid-1',
      eventType: 'PAYMENT_CONFIRMED',
      aggregateType: 'PAYMENT',
      aggregateId: 'UZQR:INV-000001',
      schemaVersion: 1,
      idempotencyKey: 'code-1:payment:UZQR:INV-000001:PAYMENT_CONFIRMED',
      provider: 'UZQR',
      paymentMethod: 'UZQR',
      operation: 'SALE',
      status: 'CONFIRMED',
      amount: 2500000,
      currency: 'UZS',
      providerPaymentId: 'rrn-1',
      providerInvoiceId: 'inv-1',
      saleId: 'SALE-000001',
      terminalId: 'term-1',
      shiftId: 1,
      cashierId: 'op-1',
      cashierName: 'Alice',
      cashierRole: 'cashier',
      createdAtMs: 1732000000000,
      completedAtMs: 1732000005000,
      rawProviderStatus: { code: '00', message: 'OK' },
    };

    beforeEach(() => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE', deviceCode: 'code-1',
      });
      mocks.prisma.posPaymentEvent.findUnique.mockResolvedValue(null);
      mocks.prisma.posPaymentEvent.create.mockResolvedValue({
        id: 'payevt-1', eventType: 'PAYMENT_CONFIRMED', status: 'CONFIRMED', createdAt: new Date('2026-07-18T00:00:00Z'),
      });
    });

    it('ingests a PAYMENT_CONFIRMED event', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/payment-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validPaymentEvent,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(typeof body.requestId).toBe('string');
      expect(body.data).toEqual({
        id: 'payevt-1', eventType: 'PAYMENT_CONFIRMED', status: 'CONFIRMED', createdAt: '2026-07-18T00:00:00.000Z',
      });
      expect(mocks.prisma.posPaymentEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 't-1',
          storeId: 's-1',
          deviceId: 'dev-1',
          eventId: 'evt-uuid-1',
          eventType: 'PAYMENT_CONFIRMED',
          aggregateType: 'PAYMENT',
          aggregateId: 'UZQR:INV-000001',
          idempotencyKey: validPaymentEvent.idempotencyKey,
          provider: 'UZQR',
          paymentMethod: 'UZQR',
          operation: 'SALE',
          status: 'CONFIRMED',
          amount: 2500000,
          currency: 'UZS',
          providerPaymentId: 'rrn-1',
          providerInvoiceId: 'inv-1',
          providerRefundId: null,
          saleId: 'SALE-000001',
          refundId: null,
          fiscalReceiptId: null,
          terminalId: 'term-1',
          shiftId: 1,
          cashierId: 'op-1',
          cashierName: 'Alice',
          cashierRole: 'cashier',
          createdAtMs: new Date(1732000000000),
          updatedAtMs: null,
          completedAtMs: new Date(1732000005000),
          reason: null,
          rawProviderStatus: { code: '00', message: 'OK' },
        }),
        select: { id: true, eventType: true, status: true, createdAt: true },
      });
      await app.close();
    });

    it('accepts a PAYMENT_REFUND_INITIATED event with minimal optional fields', async () => {
      mocks.prisma.posPaymentEvent.create.mockResolvedValue({
        id: 'payevt-2', eventType: 'PAYMENT_REFUND_INITIATED', status: 'PENDING', createdAt: new Date('2026-07-18T00:00:00Z'),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/payment-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: {
          eventId: 'evt-uuid-2',
          eventType: 'PAYMENT_REFUND_INITIATED',
          aggregateType: 'PAYMENT',
          aggregateId: 'UZQR:INV-000002',
          schemaVersion: 1,
          idempotencyKey: 'code-1:payment:UZQR:INV-000002:PAYMENT_REFUND_INITIATED',
          provider: 'UZQR',
          paymentMethod: 'UZQR',
          operation: 'REFUND',
          status: 'PENDING',
          amount: 1000000,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.posPaymentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ operation: 'REFUND', status: 'PENDING', currency: undefined }),
        })
      );
      await app.close();
    });

    it('replays a duplicate idempotencyKey with the stored result and no new create', async () => {
      mocks.prisma.posPaymentEvent.findUnique.mockResolvedValue({
        id: 'payevt-1', eventType: 'PAYMENT_CONFIRMED', status: 'CONFIRMED', createdAt: new Date('2026-07-18T00:00:00Z'),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/payment-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validPaymentEvent,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual({
        id: 'payevt-1', eventType: 'PAYMENT_CONFIRMED', status: 'CONFIRMED', createdAt: '2026-07-18T00:00:00.000Z',
      });
      expect(mocks.prisma.posPaymentEvent.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('resolves a concurrent P2002 race by returning the winning row instead of erroring', async () => {
      mocks.prisma.posPaymentEvent.create.mockRejectedValue(
        Object.assign(new Error('unique violation'), { code: 'P2002' })
      );
      mocks.prisma.posPaymentEvent.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'payevt-1', eventType: 'PAYMENT_CONFIRMED', status: 'CONFIRMED', createdAt: new Date('2026-07-18T00:00:00Z') });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/payment-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: validPaymentEvent,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual({
        id: 'payevt-1', eventType: 'PAYMENT_CONFIRMED', status: 'CONFIRMED', createdAt: '2026-07-18T00:00:00.000Z',
      });
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR for an unrecognized eventType', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/payment-events',
        headers: { authorization: 'Bearer pos_validkey', 'x-device-code': 'code-1' },
        payload: { ...validPaymentEvent, eventType: 'PAYMENT_TELEPORTED' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(mocks.prisma.posPaymentEvent.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 VALIDATION_ERROR when a required field is missing', async () => {
      const { amount: _omit, ...payload } = validPaymentEvent;

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/payment-events',
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
        url: '/api/pos/v1/payment-events',
        headers: { 'x-device-code': 'code-1' },
        payload: validPaymentEvent,
      });
      expect(response.statusCode).toBe(401);
      expect(mocks.prisma.posPaymentEvent.create).not.toHaveBeenCalled();
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
        expect.objectContaining({ where: { deviceId: 'dev-1', tenantId: 't-1', status: 'PENDING' }, take: 10 })
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
