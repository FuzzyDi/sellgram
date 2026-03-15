import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    deliveryZone: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    store: { findFirst: vi.fn() },
  },
  planGuard: vi.fn((_key: string) => async () => {}),
  permissionGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import deliveryRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
  });
  await app.register(deliveryRoutes);
  return app;
}

describe('delivery.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('PATCH /delivery-zones/:id', () => {
    it('returns 400 (not 500) for invalid payload', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/delivery-zones/zone-1',
        payload: { price: 'not-a-number' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 400 when storeId belongs to different tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null); // tenant mismatch
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/delivery-zones/zone-1',
        payload: { storeId: 'store-foreign' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 404 when zone not found for tenant', async () => {
      mocks.prisma.deliveryZone.updateMany.mockResolvedValue({ count: 0 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/delivery-zones/zone-999',
        payload: { name: 'City Center' },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('updates zone and returns 200', async () => {
      mocks.prisma.deliveryZone.updateMany.mockResolvedValue({ count: 1 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/delivery-zones/zone-1',
        payload: { name: 'City Center', price: 15000 },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.deliveryZone.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) })
      );
      await app.close();
    });
  });

  describe('DELETE /delivery-zones/:id', () => {
    it('returns 404 when zone not found', async () => {
      mocks.prisma.deliveryZone.updateMany.mockResolvedValue({ count: 0 });
      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/delivery-zones/zone-999' });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('soft-deletes zone (sets isActive=false)', async () => {
      mocks.prisma.deliveryZone.updateMany.mockResolvedValue({ count: 1 });
      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/delivery-zones/zone-1' });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.deliveryZone.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } })
      );
      await app.close();
    });
  });
});
