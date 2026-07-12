import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    orderItem: { groupBy: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    order: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0 }, _avg: { total: 0 } }),
    },
    customer: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn() },
    deliveryZone: { count: vi.fn() },
    orderReview: { aggregate: vi.fn().mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } }) },
    posDevice: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    shiftEvent: { count: vi.fn().mockResolvedValue(0) },
    fiscalEvent: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalAmount: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    counterparty: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { currentDebt: 0 } }),
    },
    counterpartyLedger: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ count: 0n }]),
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

  // ─── Multi-channel dashboard ────────────────────────────────────────────

  describe('GET /analytics/dashboard — multi-channel', () => {
    it('returns 200 on FREE plan with zeroed-out multi-channel data (dashboard only requires BASIC, which FREE has)', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(FREE_TENANT);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/analytics/dashboard' });

      expect(response.statusCode).toBe(200);
      const { data } = response.json();
      expect(data.summary.revenueToday).toBe(0);
      expect(data.pos.devicesTotal).toBe(0);
      expect(data.b2b.counterpartiesActive).toBe(0);
      expect(data.topProducts).toEqual([]);
      expect(data.posStatus).toEqual([]);
      await app.close();
    });

    it('keeps back-compat fields (orders/revenue/customers/products/reviews/revenueByDay)', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(PRO_TENANT);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/analytics/dashboard' });

      expect(response.statusCode).toBe(200);
      const { data } = response.json();
      expect(data).toEqual(
        expect.objectContaining({
          orders: expect.objectContaining({ total: 0, today: 0, week: 0, completed: 0, pending: 0 }),
          revenue: expect.objectContaining({ today: 0, week: 0, month: 0, avgCheck: 0 }),
          customers: expect.objectContaining({ total: 0, fromOrders: 0, newThisWeek: 0, repeatRate: 0 }),
          products: { total: 0 },
          reviews: { avg: null, count: 0 },
          revenueByDay: expect.any(Array),
        })
      );
      expect(data.revenueByDay).toHaveLength(14);
      await app.close();
    });

    it('sums revenueByChannel into summary.revenueToday (sellgram + pos + b2b)', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(PRO_TENANT);
      // sellgramRevenueTodayAgg, sellgramRevenueMonthAgg
      mocks.prisma.order.aggregate
        .mockResolvedValueOnce({ _sum: { total: 0 }, _avg: { total: 0 } }) // back-compat todayRevenue
        .mockResolvedValueOnce({ _sum: { total: 0 }, _avg: { total: 0 } }) // back-compat weekRevenue
        .mockResolvedValueOnce({ _sum: { total: 0 }, _avg: { total: 0 } }) // back-compat monthRevenue
        .mockResolvedValueOnce({ _sum: { total: 10000 } }) // sellgramRevenueTodayAgg
        .mockResolvedValueOnce({ _sum: { total: 50000 } }); // sellgramRevenueMonthAgg
      mocks.prisma.fiscalEvent.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 200000 } }) // posRevenueTodayAgg (tiyin) -> 2000 UZS
        .mockResolvedValueOnce({ _sum: { totalAmount: 1000000 } }); // posRevenueMonthAgg -> 10000 UZS
      mocks.prisma.counterpartyLedger.aggregate
        .mockResolvedValueOnce({ _sum: { delta: 3000 } }) // b2bRevenueTodayAgg
        .mockResolvedValueOnce({ _sum: { delta: 15000 } }); // b2bRevenueMonthAgg

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/analytics/dashboard' });

      expect(response.statusCode).toBe(200);
      const { data } = response.json();
      expect(data.summary.revenueByChannel).toEqual({ sellgram: 10000, pos: 2000, b2b: 3000 });
      expect(data.summary.revenueToday).toBe(10000 + 2000 + 3000);
      expect(data.summary.revenueMonth).toBe(50000 + 10000 + 15000);
      expect(data.sellgram.revenueMonth).toBe(50000);
      expect(data.pos.revenueToday).toBe(2000);
      expect(data.b2b.totalDebt).toBe(0);
      await app.close();
    });

    it('marks a device online only if lastSeenAt is within the last 5 minutes', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(PRO_TENANT);
      const recentlySeen = new Date(Date.now() - 60 * 1000); // 1 min ago
      const staleSeen = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
      mocks.prisma.posDevice.findMany.mockResolvedValue([
        { name: 'Front till', lastSeenAt: recentlySeen },
        { name: 'Back office till', lastSeenAt: staleSeen },
      ]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/analytics/dashboard' });

      expect(response.statusCode).toBe(200);
      const { data } = response.json();
      expect(data.posStatus).toEqual([
        { name: 'Front till', online: true, lastSeenAt: recentlySeen.toISOString() },
        { name: 'Back office till', online: false, lastSeenAt: staleSeen.toISOString() },
      ]);
      await app.close();
    });

    it('merges topProducts from Order.items (groupBy) and FiscalEvent.items (Json), converting POS qty/amount units', async () => {
      mocks.prisma.tenant.findUnique.mockResolvedValue(PRO_TENANT);
      mocks.prisma.orderItem.groupBy.mockResolvedValue([
        { name: 'Coffee', _sum: { qty: 3, total: 30000 } },
      ]);
      mocks.prisma.fiscalEvent.findMany.mockImplementation((args: any) =>
        // Only the topProducts query selects { items: true } — the
        // 14-day revenueChart query selects { createdAtMs, totalAmount }.
        args?.select?.items
          ? Promise.resolve([
              { items: [{ name: 'Coffee', qty: 2000, total: 20000 }] }, // qty x1000 fixed-point, tiyin
              { items: [{ name: 'Tea', qty: 1000, total: 5000 }] },
            ])
          : Promise.resolve([])
      );

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/analytics/dashboard' });

      expect(response.statusCode).toBe(200);
      const { data } = response.json();
      expect(data.topProducts).toEqual([
        { name: 'Coffee', qty: 5, amount: 30000 + 200 }, // 3 (order) + 2 (pos, 2000/1000); 30000 + 200 (20000/100)
        { name: 'Tea', qty: 1, amount: 50 },
      ]);
      await app.close();
    });
  });
});
