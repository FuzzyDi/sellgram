import { FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../../lib/prisma.js';
import { validateInitData, type TelegramUser } from '../../lib/telegram-auth.js';
import { decrypt } from '../../lib/encrypt.js';
import { getConfig } from '../../config/index.js';
import { dispatchWebhook } from '../../lib/webhook-dispatcher.js';

declare module 'fastify' {
  interface FastifyRequest {
    telegramUser?: TelegramUser;
    customer?: { id: string; tenantId: string };
    storeId?: string;
  }
}

export async function telegramShopAuth(request: FastifyRequest, reply: FastifyReply) {
  const initData = request.headers['x-telegram-init-data'] as string;
  const storeId = request.headers['x-store-id'] as string;
  const isPublicCatalogRead =
    request.method === 'GET' &&
    (request.url.startsWith('/api/shop/catalog') || request.url.startsWith('/api/shop/products/'));

  if (!storeId) {
    return reply.status(401).send({ success: false, error: 'Missing store ID' });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || !store.isActive) {
    return reply.status(404).send({ success: false, error: 'Store not found' });
  }

  request.storeId = storeId;

  if (initData) {
    let botToken: string;
    try {
      botToken = decrypt(store.botToken);
    } catch {
      return reply.status(401).send({ success: false, error: 'Auth failed' });
    }
    const tgUser = validateInitData(initData, botToken, getConfig().MINIAPP_INITDATA_MAX_AGE_SEC);
    if (tgUser) {
      request.telegramUser = tgUser;

      const customer = await prisma.customer.upsert({
        where: { tenantId_telegramId: { tenantId: store.tenantId, telegramId: BigInt(tgUser.id) } },
        create: {
          tenantId: store.tenantId,
          telegramId: BigInt(tgUser.id),
          telegramUser: tgUser.username,
          firstName: tgUser.first_name,
          lastName: tgUser.last_name,
        },
        update: {},
        select: { id: true, createdAt: true, firstName: true, lastName: true, telegramUser: true },
      });

      // Dispatch customer.created only for genuinely new records (created within this request)
      if (Date.now() - customer.createdAt.getTime() < 5000) {
        dispatchWebhook(store.tenantId, 'customer.created', {
          customerId: customer.id,
          telegramId: tgUser.id.toString(),
          firstName: customer.firstName,
          lastName: customer.lastName,
          username: customer.telegramUser,
        });
      }

      request.customer = { id: customer.id, tenantId: store.tenantId };
      return;
    }
  }

  const cfg = getConfig();
  if (process.env.NODE_ENV !== 'production' && cfg.ALLOW_DEV_AUTH_BYPASS) {
    // WARNING: dev-only bypass — never enable ALLOW_DEV_AUTH_BYPASS in production
    const firstCustomer = await prisma.customer.findFirst({ where: { tenantId: store.tenantId } });
    if (firstCustomer) {
      request.log.warn({ storeId, customerId: firstCustomer.id }, 'DEV_AUTH_BYPASS used — disable in production');
      request.customer = { id: firstCustomer.id, tenantId: store.tenantId };
      return;
    }
  }

  if (isPublicCatalogRead) {
    // Allow first catalog/product load before Telegram initData becomes available.
    // Cart/checkout/orders remain protected by full Telegram auth.
    request.customer = { id: '', tenantId: store.tenantId };
    return;
  }

  return reply.status(401).send({ success: false, error: 'Auth failed' });
}
