import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    order: { findFirst: vi.fn() },
    paymentWebhookEvent: { create: vi.fn() },
  },
  applyOrderPaymentStatus: vi.fn(),
  notifyPaymentPaid: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../payments/service.js', () => ({ applyOrderPaymentStatus: mocks.applyOrderPaymentStatus }));
vi.mock('../../bot/bot-manager.js', () => ({ notifyPaymentPaid: mocks.notifyPaymentPaid }));

import paymentRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  await app.register(paymentRoutes);
  return app;
}

describe('payment.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── POST /payments/webhook/MANUAL_TRANSFER — secret enforcement ──────────

  describe('POST /payments/webhook/MANUAL_TRANSFER', () => {
    it('returns 401 when no webhookSecret is configured on the payment method', async () => {
      mocks.prisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        storeId: 'store-1',
        paymentMethod: 'MANUAL_TRANSFER',
        paymentMethodRef: { meta: {} },
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/payments/webhook/MANUAL_TRANSFER',
        payload: { orderId: 'order-1', status: 'PAID' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe(
        'MANUAL_TRANSFER webhook requires webhookSecret configured on payment method'
      );
      expect(mocks.applyOrderPaymentStatus).not.toHaveBeenCalled();
      await app.close();
    });

    it('accepts the webhook when the configured secret is provided', async () => {
      mocks.prisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        storeId: 'store-1',
        paymentMethod: 'MANUAL_TRANSFER',
        paymentMethodRef: { meta: { webhookSecret: 'topsecret' } },
      });
      mocks.applyOrderPaymentStatus.mockResolvedValue({ id: 'order-1', storeId: 'store-1' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/payments/webhook/MANUAL_TRANSFER',
        headers: { 'x-payment-secret': 'topsecret' },
        payload: { orderId: 'order-1', status: 'PAID' },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.applyOrderPaymentStatus).toHaveBeenCalled();
      await app.close();
    });
  });
});
