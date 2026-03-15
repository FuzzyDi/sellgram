import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import prisma from '../../lib/prisma.js';
import { applyOrderPaymentStatus } from '../../payments/service.js';
import { normalizeProviderWebhook, verifyProviderWebhookAuth } from '../../payments/webhooks.js';

const webhookSchema = z.object({
  orderId: z.string().optional(),
  orderNumber: z.number().int().positive().optional(),
  storeId: z.string().optional(),
  status: z.enum(['PENDING', 'PAID', 'REFUNDED']).optional(),
  paymentRef: z.string().optional(),
  eventId: z.string().optional(),
  secret: z.string().optional(),
  payload: z.any().optional(),
}).passthrough();

function providerFromOrderPaymentMethod(method: string): string {
  switch (method) {
    case 'CASH_ON_DELIVERY':
      return 'CASH';
    case 'MANUAL_TRANSFER':
      return 'MANUAL_TRANSFER';
    case 'TELEGRAM':
      return 'TELEGRAM';
    case 'CLICK':
      return 'CLICK';
    case 'PAYME':
      return 'PAYME';
    case 'UZUM':
      return 'UZUM';
    case 'STRIPE':
      return 'STRIPE';
    default:
      return 'CUSTOM';
  }
}

export default async function paymentRoutes(fastify: FastifyInstance) {
  fastify.post('/payments/webhook/:provider', { config: { rateLimit: false } }, async (request, reply) => {
    const provider = String((request.params as { provider: string }).provider || '').toUpperCase();
    const body = webhookSchema.parse(request.body);
    const normalized = normalizeProviderWebhook(provider, body);

    const lookup = {
      orderId: body.orderId || normalized.orderId,
      orderNumber: body.orderNumber || normalized.orderNumber,
      storeId: body.storeId || normalized.storeId,
    };

    if (!lookup.orderId && !(lookup.orderNumber && lookup.storeId)) {
      return reply.status(400).send({ success: false, error: 'orderId or (orderNumber + storeId) is required' });
    }

    // Always scope by storeId when available to enforce tenant isolation
    const order = await prisma.order.findFirst({
      where: lookup.orderId
        ? { id: lookup.orderId, ...(lookup.storeId ? { storeId: lookup.storeId } : {}) }
        : { orderNumber: lookup.orderNumber!, storeId: lookup.storeId! },
      include: {
        paymentMethodRef: true,
      },
    });

    if (!order) {
      return reply.status(404).send({ success: false, error: 'Order not found' });
    }

    const expectedProvider = providerFromOrderPaymentMethod(order.paymentMethod);
    if (provider !== expectedProvider) {
      return reply.status(400).send({ success: false, error: `Provider mismatch. Expected ${expectedProvider}` });
    }

    const providedSecret =
      String(request.headers['x-payment-secret'] || '') ||
      String(body.secret || '');
    const configuredSecret = String((order.paymentMethodRef?.meta as any)?.webhookSecret || '');

    if (configuredSecret) {
      const provided = Buffer.from(providedSecret);
      const expected = Buffer.from(configuredSecret);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return reply.status(401).send({ success: false, error: 'Invalid webhook secret' });
      }
    }

    try {
      verifyProviderWebhookAuth({
        provider,
        headers: request.headers as any,
        body: body as any,
        methodMeta: (order.paymentMethodRef?.meta as any) || {},
      });
    } catch (err: any) {
      return reply.status(401).send({ success: false, error: err.message });
    }

    const targetStatus = body.status || normalized.status;
    const targetRef = body.paymentRef || normalized.paymentRef;
    const targetEventId = body.eventId || normalized.eventId;

    // Atomic idempotency: attempt to insert a unique (orderId, eventId) record.
    // If the eventId was already processed, the unique constraint raises P2002
    // and we return early — safe under concurrent duplicate deliveries.
    if (targetEventId) {
      try {
        await prisma.paymentWebhookEvent.create({
          data: { orderId: order.id, eventId: targetEventId, provider },
        });
      } catch (err: unknown) {
        if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
          return { success: true, data: { orderId: order.id, ignored: true } };
        }
        throw err;
      }
    }

    try {
      const updated = await applyOrderPaymentStatus(prisma, {
        orderId: order.id,
        status: targetStatus as any,
        paymentRef: targetRef,
        metaPatch: {
          provider,
          providerStatus: targetStatus,
          lastProviderEventId: targetEventId,
          providerPayload: normalized.payload ?? body.payload ?? null,
        },
      });

      return {
        success: true,
        data: {
          orderId: updated.id,
          paymentStatus: updated.paymentStatus,
        },
      };
    } catch (err: any) {
      if (err.message === 'ORDER_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Order not found' });
      }
      if (err.message.startsWith('BAD_PAYMENT_TRANSITION:')) {
        const [, from, to] = err.message.split(':');
        return reply.status(400).send({ success: false, error: `Cannot change payment status from ${from} to ${to}` });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
}
