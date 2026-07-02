import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    deviceActivation: { findUnique: vi.fn(), update: vi.fn() },
    posDevice: { update: vi.fn(), findUnique: vi.fn() },
    syncCursor: { upsert: vi.fn().mockResolvedValue({}) },
    catalogSnapshot: { findFirst: vi.fn() },
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

  describe('POST /api/pos/v1/activate', () => {
    it('confirms a pending, non-expired activation and returns a device api key', async () => {
      mocks.prisma.deviceActivation.findUnique.mockResolvedValue({
        id: 'act-1',
        deviceId: 'dev-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        device: { id: 'dev-1' },
      });
      mocks.prisma.$transaction.mockResolvedValue([
        { id: 'dev-1', tenantId: 't-1', storeId: 's-1', name: 'Front till' },
        {},
        {},
      ]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/activate',
        payload: { activationCode: 'ABCD-1234' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.deviceId).toBe('dev-1');
      expect(body.data.tenantId).toBe('t-1');
      expect(typeof body.data.apiKey).toBe('string');
      expect(body.data.apiKey.startsWith('pos_')).toBe(true);
      await app.close();
    });

    it('returns 404 for an unknown activation code', async () => {
      mocks.prisma.deviceActivation.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/activate',
        payload: { activationCode: 'NOPE-0000' },
      });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });

    it('marks an expired pending activation as EXPIRED and returns 400', async () => {
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
        payload: { activationCode: 'EXPI-RED0' },
      });

      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.deviceActivation.update).toHaveBeenCalledWith({
        where: { id: 'act-2' },
        data: { status: 'EXPIRED' },
      });
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 for an already-confirmed activation code', async () => {
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
        payload: { activationCode: 'USED-CODE' },
      });

      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when activationCode is missing', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/api/pos/v1/activate', payload: {} });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /api/pos/v1/heartbeat', () => {
    it('updates lastSeenAt for a valid device key', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.posDevice.update.mockResolvedValue({});

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/pos/v1/heartbeat',
        headers: { authorization: 'Bearer pos_validkey' },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.posDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'dev-1' } })
      );
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
    it('returns the latest snapshot for the device store', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({
        version: 3, payload: { products: [] }, createdAt: new Date(),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot',
        headers: { authorization: 'Bearer pos_validkey' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.version).toBe(3);
      expect(mocks.prisma.syncCursor.upsert).toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 when no snapshot exists yet', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot',
        headers: { authorization: 'Bearer pos_validkey' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('returns 401 for an invalid device key', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/catalog/snapshot',
        headers: { authorization: 'Bearer bad' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('GET /api/pos/v1/settings', () => {
    it('returns minimal store settings for a valid device', async () => {
      mocks.prisma.posDevice.findUnique.mockResolvedValue({
        id: 'dev-1', tenantId: 't-1', storeId: 's-1', status: 'ACTIVE',
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/pos/v1/settings',
        headers: { authorization: 'Bearer pos_validkey' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual({ currency: 'UZS', timezone: 'Asia/Tashkent' });
      await app.close();
    });

    it('returns 401 for a missing device key', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/api/pos/v1/settings' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('still-stubbed endpoints', () => {
    const cases: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'POST', url: '/api/pos/v1/sale-events' },
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
