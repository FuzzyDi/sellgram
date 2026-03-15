import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import prisma from '../../lib/prisma.js';
import { getBotWebhookHandler } from '../../bot/bot-manager.js';

export default async function botRoutes(fastify: FastifyInstance) {
  fastify.post('/webhook/:storeId', { config: { rateLimit: false } }, async (request, reply) => {
    const { storeId } = request.params as { storeId: string };

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, webhookSecret: true, isActive: true },
    });
    if (!store || !store.isActive) {
      return reply.status(404).send({ success: false, error: 'Bot not found' });
    }

    const secretHeader = String(request.headers['x-telegram-bot-api-secret-token'] || '');
    const isBypass = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true';
    if (!isBypass) {
      const expected = Buffer.from(store.webhookSecret ?? '');
      const provided = Buffer.from(secretHeader);
      const valid =
        expected.length > 0 &&
        provided.length === expected.length &&
        crypto.timingSafeEqual(provided, expected);
      if (!valid) {
        return reply.status(401).send({ success: false, error: 'Invalid webhook secret' });
      }
    }

    const handler = getBotWebhookHandler(storeId);
    if (!handler) {
      return reply.status(404).send({ success: false, error: 'Bot not found' });
    }

    return handler(request, reply);
  });
}

