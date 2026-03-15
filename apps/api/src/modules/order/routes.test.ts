import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    order: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  },
  updateOrderStatus: vi.fn(),
  applyOrderPaymentStatus: vi.fn(),
  notifyOrderStatus: vi.fn().mockResolvedValue(undefined),
  permissionGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('./order.service.js', () => ({ updateOrderStatus: mocks.updateOrderStatus }));
vi.mock('../../payments/service.js', () => ({ applyOrderPaymentStatus: mocks.applyOrderPaymentStatus }));
vi.mock('../../bot/bot-manager.js', () => ({ notifyOrderStatus: mocks.notifyOrderStatus }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import orderRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1', role: 'OWNER' };
  });
  await app.register(orderRoutes);
  return app;
}

describe('order.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── PATCH /status — input validation ─────────────────────────────────────

  describe('PATCH /orders/:id/status', () => {
    it('returns 400 (not 500) for invalid status value', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-1/status',
        payload: { status: 'FLYING' },
      });
      expect(response.statusCode).toBe(400);
      expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 when order does not exist', async () => {
      mocks.updateOrderStatus.mockRejectedValue(new Error('ORDER_NOT_FOUND'));
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-999/status',
        payload: { status: 'CONFIRMED' },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('returns 400 for illegal status transition', async () => {
      mocks.updateOrderStatus.mockRejectedValue(new Error('BAD_TRANSITION:COMPLETED:CONFIRMED'));
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-1/status',
        payload: { status: 'CONFIRMED' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('COMPLETED');
      await app.close();
    });

    it('returns 400 for insufficient stock', async () => {
      mocks.updateOrderStatus.mockRejectedValue(new Error('INSUFFICIENT_STOCK:Widget'));
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-1/status',
        payload: { status: 'CONFIRMED' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('Widget');
      await app.close();
    });

    it('updates status and fires notification on success', async () => {
      mocks.updateOrderStatus.mockResolvedValue({ storeId: 'store-1' });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-1/status',
        payload: { status: 'CONFIRMED' },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.updateOrderStatus).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'o-1', tenantId: 'tenant-1', status: 'CONFIRMED' })
      );
      await app.close();
    });
  });

  // ─── GET /orders — query validation ──────────────────────────────────────

  describe('GET /orders', () => {
    it('returns 400 when pageSize exceeds 100', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/orders?pageSize=999' });
      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.order.findMany).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 for invalid status enum', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/orders?status=FLYING' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 400 for invalid paymentStatus enum', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/orders?paymentStatus=CHARGED' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns paginated orders for valid query', async () => {
      mocks.prisma.order.findMany.mockResolvedValue([{ id: 'o-1' }]);
      mocks.prisma.order.count.mockResolvedValue(1);
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/orders?page=1&pageSize=10&status=NEW' });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.items).toHaveLength(1);
      expect(mocks.prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 0 })
      );
      await app.close();
    });
  });

  // ─── PATCH /delivery ──────────────────────────────────────────────────────

  describe('PATCH /orders/:id/delivery', () => {
    it('updates delivery info on valid body', async () => {
      mocks.prisma.order.updateMany.mockResolvedValue({ count: 1 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-1/delivery',
        payload: { deliveryPrice: 15000, trackingNumber: 'TRK-123' },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'o-1', tenantId: 'tenant-1' }),
          data: expect.objectContaining({ deliveryPrice: 15000, trackingNumber: 'TRK-123' }),
        })
      );
      await app.close();
    });

    it('returns 404 when order not found', async () => {
      mocks.prisma.order.updateMany.mockResolvedValue({ count: 0 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-999/delivery',
        payload: { deliveryPrice: 5000 },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('returns 400 for negative deliveryPrice', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-1/delivery',
        payload: { deliveryPrice: -100 },
      });
      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.order.updateMany).not.toHaveBeenCalled();
      await app.close();
    });
  });

  // ─── PATCH /payment — input validation ────────────────────────────────────

  describe('PATCH /orders/:id/payment', () => {
    it('returns 400 (not 500) for invalid paymentStatus value', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-1/payment',
        payload: { paymentStatus: 'CHARGED' },
      });
      expect(response.statusCode).toBe(400);
      expect(mocks.applyOrderPaymentStatus).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 when order not found', async () => {
      mocks.applyOrderPaymentStatus.mockRejectedValue(new Error('ORDER_NOT_FOUND'));
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-999/payment',
        payload: { paymentStatus: 'PAID' },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('returns 400 for bad payment transition', async () => {
      mocks.applyOrderPaymentStatus.mockRejectedValue(new Error('BAD_PAYMENT_TRANSITION:REFUNDED:PAID'));
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-1/payment',
        payload: { paymentStatus: 'PAID' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('REFUNDED');
      await app.close();
    });

    it('updates payment status on success', async () => {
      mocks.applyOrderPaymentStatus.mockResolvedValue({ paymentStatus: 'PAID' });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/orders/o-1/payment',
        payload: { paymentStatus: 'PAID' },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.applyOrderPaymentStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orderId: 'o-1', tenantId: 'tenant-1', status: 'PAID' })
      );
      await app.close();
    });
  });
});
