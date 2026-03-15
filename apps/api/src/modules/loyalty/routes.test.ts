import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    loyaltyConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
  permissionGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import loyaltyRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
  });
  await app.register(loyaltyRoutes);
  return app;
}

describe('loyalty.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('GET /loyalty/config', () => {
    it('uses upsert (not findUnique+create) to avoid race condition', async () => {
      mocks.prisma.loyaltyConfig.upsert.mockResolvedValue({ tenantId: 'tenant-1', isEnabled: false });
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/loyalty/config' });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.loyaltyConfig.upsert).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        update: {},
        create: { tenantId: 'tenant-1' },
      });
      expect(mocks.prisma.loyaltyConfig.findUnique).not.toHaveBeenCalled();
      expect(mocks.prisma.loyaltyConfig.create).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('PATCH /loyalty/config — validation', () => {
    it('rejects unitAmount = 0 (would cause division by zero)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/loyalty/config',
        payload: { unitAmount: 0 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects pointValue = 0', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/loyalty/config',
        payload: { pointValue: 0 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects maxDiscountPct > 100', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/loyalty/config',
        payload: { maxDiscountPct: 101 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects pointsPerUnit = 0', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/loyalty/config',
        payload: { pointsPerUnit: 0 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects negative unitAmount', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/loyalty/config',
        payload: { unitAmount: -5 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('accepts maxDiscountPct = 0 (disable discounts)', async () => {
      mocks.prisma.loyaltyConfig.upsert.mockResolvedValue({
        tenantId: 'tenant-1', maxDiscountPct: 0,
      });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/loyalty/config',
        payload: { maxDiscountPct: 0 },
      });
      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('accepts valid full config', async () => {
      mocks.prisma.loyaltyConfig.upsert.mockResolvedValue({
        tenantId: 'tenant-1',
        isEnabled: true,
        pointsPerUnit: 1,
        unitAmount: 100,
        pointValue: 10,
        maxDiscountPct: 20,
        minPointsToRedeem: 50,
      });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/loyalty/config',
        payload: {
          isEnabled: true,
          pointsPerUnit: 1,
          unitAmount: 100,
          pointValue: 10,
          maxDiscountPct: 20,
          minPointsToRedeem: 50,
        },
      });
      expect(response.statusCode).toBe(200);
      await app.close();
    });
  });
});
