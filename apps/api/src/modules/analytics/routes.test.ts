import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    orderItem: { groupBy: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn() },
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0 }, _avg: { total: 0 } }),
    },
    customer: { count: vi.fn(), findMany: vi.fn() },
    deliveryZone: { count: vi.fn() },
  },
  redis: {
    get: vi.fn(),
    incr: vi.fn(),
    decr: vi.fn(),
    ttl: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../lib/redis.js', () => ({ getRedis: () => mocks.redis }));

import analyticsRoutes from './routes.js';

// PRO plan: allowReportExport=true, maxExportsPerMonth (fallback=50), reportsLevel=ADVANCED
const PRO_TENANT = { plan: 'PRO' };
// FREE plan: allowReportExport=false
const FREE_TENANT = { plan: 'FREE' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
  });
  await app.register(analyticsRoutes);
  return app;
}

describe('analytics.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── Export quota ──────────────────────────────────────────────────────────

  describe('GET /analytics/reports/export — export quota', () => {
    it('returns 402 when allowReportExport = false (FREE plan)', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(FREE_TENANT);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/reports/export?type=top-products',
      });

      expect(response.statusCode).toBe(402);
      expect(response.json().error).toMatch(/export/i);
      // Redis should not be touched at all
      expect(mocks.redis.incr).not.toHaveBeenCalled();
      await app.close();
    });

    it('increments Redis counter and serves CSV when under limit', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(PRO_TENANT);
      // PRO fallback: maxExportsPerMonth = 50; incr returns 1 (first export)
      mocks.redis.incr.mockResolvedValue(1);
      mocks.redis.ttl.mockResolvedValue(-1);
      mocks.redis.expire.mockResolvedValue(1);
      mocks.prisma.orderItem.groupBy.mockResolvedValue([]);
      mocks.prisma.product.findMany.mockResolvedValue([]);
      mocks.prisma.orderItem.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/reports/export?type=top-products',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(mocks.redis.incr).toHaveBeenCalledTimes(1);
      expect(mocks.redis.decr).not.toHaveBeenCalled();
      await app.close();
    });

    it('rolls back (decr) and returns 402 when incr exceeds limit', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(PRO_TENANT);
      // PRO fallback: maxExportsPerMonth = 50; incr returns 51 (over limit)
      mocks.redis.incr.mockResolvedValue(51);
      mocks.redis.ttl.mockResolvedValue(86400);
      mocks.redis.decr.mockResolvedValue(50);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/reports/export?type=top-products',
      });

      expect(response.statusCode).toBe(402);
      expect(response.json().error).toMatch(/limit/i);
      // Rollback must happen
      expect(mocks.redis.decr).toHaveBeenCalledTimes(1);
      await app.close();
    });

    it('returns 400 for unknown report type (before incr)', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(PRO_TENANT);
      mocks.redis.incr.mockResolvedValue(1);
      mocks.redis.ttl.mockResolvedValue(-1);
      mocks.redis.expire.mockResolvedValue(1);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/reports/export?type=unknown-type',
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  // ─── Plan-level access ─────────────────────────────────────────────────────

  describe('GET /analytics/revenue — ADVANCED level guard', () => {
    it('returns 402 on FREE plan (BASIC only)', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(FREE_TENANT);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/revenue',
      });

      expect(response.statusCode).toBe(402);
      await app.close();
    });

    it('returns 200 on PRO plan (ADVANCED)', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(PRO_TENANT);
      mocks.prisma.order.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/revenue',
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });
  });
});
