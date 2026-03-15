import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    customer: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    loyaltyTransaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import customerRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1' };
  });
  await app.register(customerRoutes);
  return app;
}

describe('customer.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── GET /customers — query validation ───────────────────────────────────

  describe('GET /customers', () => {
    it('returns paginated customers for valid query', async () => {
      mocks.prisma.customer.findMany.mockResolvedValue([{ id: 'c-1', telegramId: BigInt(1001), firstName: 'Alice' }]);
      mocks.prisma.customer.count.mockResolvedValue(1);
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/customers?page=1&pageSize=10' });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.items).toHaveLength(1);
      expect(body.data.pageSize).toBe(10);
      expect(mocks.prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 0 })
      );
      await app.close();
    });

    it('returns 400 when pageSize exceeds 100', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/customers?pageSize=500' });
      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.customer.findMany).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 for non-numeric page', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/customers?page=abc' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  // ─── PATCH /customers/:id ──────────────────────────────────────────────────

  describe('PATCH /customers/:id', () => {
    it('returns 404 when customer not found for tenant', async () => {
      mocks.prisma.customer.updateMany.mockResolvedValue({ count: 0 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/customers/c-999',
        payload: { note: 'VIP' },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('updates and returns 200 with tenantId filter', async () => {
      mocks.prisma.customer.updateMany.mockResolvedValue({ count: 1 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/customers/c-1',
        payload: { note: 'VIP', phone: '+998901234567' },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.customer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) })
      );
      await app.close();
    });

    it('returns 400 when tags is not an array', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/customers/c-1',
        payload: { tags: 'vip' },
      });
      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.customer.updateMany).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when note exceeds 2000 characters', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/customers/c-1',
        payload: { note: 'x'.repeat(2001) },
      });
      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.customer.updateMany).not.toHaveBeenCalled();
      await app.close();
    });
  });

  // ─── POST /customers/:id/loyalty — race-condition fix ─────────────────────

  describe('POST /customers/:id/loyalty', () => {
    it('wraps balance check and writes in a single transaction', async () => {
      const tx = {
        customer: {
          findFirst: vi.fn().mockResolvedValue({ loyaltyPoints: 100 }),
          update: vi.fn().mockResolvedValue({}),
        },
        loyaltyTransaction: { create: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customers/c-1/loyalty',
        payload: { points: -30, description: 'Redemption' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.loyaltyPoints).toBe(70);
      // All writes inside the transaction
      expect(tx.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { loyaltyPoints: 70 } })
      );
      expect(tx.loyaltyTransaction.create).toHaveBeenCalledTimes(1);
      // Outer prisma was NOT used directly
      expect(mocks.prisma.customer.update).not.toHaveBeenCalled();
      expect(mocks.prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 when customer not found', async () => {
      const tx = {
        customer: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
        loyaltyTransaction: { create: vi.fn() },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customers/c-999/loyalty',
        payload: { points: -10 },
      });

      expect(response.statusCode).toBe(404);
      expect(tx.customer.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when points would push balance below zero', async () => {
      const tx = {
        customer: { findFirst: vi.fn().mockResolvedValue({ loyaltyPoints: 50 }), update: vi.fn() },
        loyaltyTransaction: { create: vi.fn() },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customers/c-1/loyalty',
        payload: { points: -100 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/insufficient/i);
      expect(tx.customer.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects float points with 400 (Zod)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customers/c-1/loyalty',
        payload: { points: 1.5 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects zero points with 400 (Zod)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customers/c-1/loyalty',
        payload: { points: 0 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('allows adding points', async () => {
      const tx = {
        customer: {
          findFirst: vi.fn().mockResolvedValue({ loyaltyPoints: 50 }),
          update: vi.fn().mockResolvedValue({}),
        },
        loyaltyTransaction: { create: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/customers/c-1/loyalty',
        payload: { points: 200, description: 'Bonus' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.loyaltyPoints).toBe(250);
      await app.close();
    });
  });
});
