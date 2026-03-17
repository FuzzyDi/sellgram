import { Bot } from 'grammy';
import prisma from '../../lib/prisma.js';
import { getConfig } from '../../config/index.js';
import { decrypt, encrypt } from '../../lib/encrypt.js';
import type { CreateStoreInput, UpdateStoreInput } from './dto.js';
import { registerBot, isBotRegistered } from '../../bot/bot-manager.js';

export class StoreServiceError extends Error {
  code:
    | 'STORE_NOT_FOUND'
    | 'STORE_INACTIVE'
    | 'WEBHOOK_BASE_URL_NOT_CONFIGURED'
    | 'STORE_HAS_ORDERS'
    | 'LAST_STORE_CANNOT_BE_DELETED';

  constructor(code: StoreServiceError['code']) {
    super(code);
    this.code = code;
  }
}

export async function listTenantStores(tenantId: string) {
  return prisma.store.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      botUsername: true,
      isActive: true,
      miniAppUrl: true,
      createdAt: true,
      _count: { select: { paymentMethods: { where: { isActive: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createTenantStore(tenantId: string, input: CreateStoreInput) {
  const encryptedToken = encrypt(input.botToken);
  const cfg = getConfig();

  const store = await prisma.store.create({
    data: {
      tenantId,
      name: input.name,
      botToken: encryptedToken,
      welcomeMessage: input.welcomeMessage,
      paymentMethods: {
        create: {
          tenantId,
          provider: 'CASH',
          code: 'cash_on_delivery',
          title: 'Cash on delivery',
          description: 'Pay when receiving the order',
          isDefault: true,
        },
      },
    },
  });

  // Auto-fill miniAppUrl from MINIAPP_URL config
  const miniAppBase = (cfg.MINIAPP_URL || '').trim();
  if (miniAppBase && !store.miniAppUrl) {
    const miniAppUrl = `${miniAppBase.replace(/\/+$/, '')}/?storeId=${store.id}`;
    return prisma.store.update({ where: { id: store.id }, data: { miniAppUrl } });
  }

  return store;
}

export async function getTenantStore(tenantId: string, id: string) {
  const store = await prisma.store.findFirst({
    where: { id, tenantId },
    include: {
      deliveryZones: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      paymentMethods: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] },
    },
  });

  if (!store) throw new StoreServiceError('STORE_NOT_FOUND');
  return { ...store, botToken: '***', webhookSecret: '***' };
}

export async function updateTenantStore(tenantId: string, id: string, input: UpdateStoreInput) {
  const data: Record<string, unknown> = { ...input };
  if (input.botToken) {
    data.botToken = encrypt(input.botToken);
  }

  const result = await prisma.store.updateMany({
    where: { id, tenantId },
    data,
  });

  if (result.count === 0) throw new StoreServiceError('STORE_NOT_FOUND');
}

export async function activateTenantStoreBot(tenantId: string, id: string) {
  const store = await prisma.store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      botToken: true,
      miniAppUrl: true,
      welcomeMessage: true,
      webhookSecret: true,
      isActive: true,
    },
  });

  if (!store) throw new StoreServiceError('STORE_NOT_FOUND');
  if (!store.isActive) throw new StoreServiceError('STORE_INACTIVE');

  const cfg = getConfig();
  const webhookBase = (cfg.APP_URL || '').trim();
  if (!webhookBase) throw new StoreServiceError('WEBHOOK_BASE_URL_NOT_CONFIGURED');

  const token = decrypt(store.botToken);
  const bot = new Bot(token);
  await bot.init();

  let miniAppUrl: string | null = null;
  if (store.miniAppUrl) {
    const u = new URL(store.miniAppUrl);
    if (!u.searchParams.get('storeId')) u.searchParams.set('storeId', store.id);
    miniAppUrl = u.toString();
    if (miniAppUrl !== store.miniAppUrl) {
      await prisma.store.update({ where: { id: store.id }, data: { miniAppUrl } });
    }
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: 'Shop',
        web_app: { url: miniAppUrl },
      },
    });
  }

  const webhookUrl = `${webhookBase.replace(/\/+$/, '')}/webhook/${store.id}`;
  await bot.api.setWebhook(webhookUrl, {
    secret_token: store.webhookSecret,
    drop_pending_updates: false,
  });

  // Register bot in memory so webhooks work without API restart.
  // Pass the already-initialised bot instance to avoid a second bot.init() call.
  if (!isBotRegistered(store.id)) {
    try {
      await registerBot(store.id, tenantId, store.botToken, store.welcomeMessage ?? '', miniAppUrl, bot);
    } catch (err: any) {
      // Webhook is set, but in-memory registration failed — will work after restart
      console.error(`Auto-register bot in memory failed for store ${store.id}: ${err.message}`);
    }
  }

  return { storeId: store.id, webhookUrl, miniAppUrl };
}


export async function checkTenantStoreBotConnection(tenantId: string, id: string) {
  const store = await prisma.store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      name: true,
      botToken: true,
      miniAppUrl: true,
      webhookSecret: true,
      isActive: true,
    },
  });

  if (!store) throw new StoreServiceError('STORE_NOT_FOUND');

  const cfg = getConfig();
  const webhookBase = (cfg.APP_URL || '').trim();
  const expectedWebhookUrl = webhookBase
    ? `${webhookBase.replace(/\/+$/, '')}/webhook/${store.id}`
    : null;

  const diagnostics: Record<string, unknown> = {
    ok: false,
    storeId: store.id,
    storeName: store.name,
    isActive: store.isActive,
    expectedWebhookUrl,
    miniApp: {
      configured: Boolean(store.miniAppUrl),
      url: store.miniAppUrl,
      hasStoreIdParam: false,
    },
  };

  if (store.miniAppUrl) {
    try {
      const url = new URL(store.miniAppUrl);
      (diagnostics.miniApp as any).hasStoreIdParam = Boolean(url.searchParams.get('storeId'));
    } catch {
      (diagnostics.miniApp as any).hasStoreIdParam = false;
    }
  }

  if (!store.isActive) {
    diagnostics.error = 'Store is inactive';
    return diagnostics;
  }

  if (!expectedWebhookUrl) {
    diagnostics.error = 'APP_URL is not configured';
    return diagnostics;
  }

  try {
    const token = decrypt(store.botToken);
    const bot = new Bot(token);
    const [me, webhook] = await Promise.all([bot.api.getMe(), bot.api.getWebhookInfo()]);

    const webhookMatches = webhook.url === expectedWebhookUrl;

    diagnostics.bot = {
      id: me.id,
      username: me.username,
      firstName: me.first_name,
    };
    diagnostics.webhook = {
      currentUrl: webhook.url,
      expectedUrl: expectedWebhookUrl,
      matchesExpected: webhookMatches,
      pendingUpdateCount: webhook.pending_update_count,
      lastErrorDate: webhook.last_error_date || null,
      lastErrorMessage: webhook.last_error_message || null,
    };
    diagnostics.ok = webhookMatches;

    if (!webhookMatches) {
      diagnostics.error = 'Webhook URL mismatch';
    }

    return diagnostics;
  } catch (err: any) {
    diagnostics.error = err?.message || 'Failed to validate bot token';
    return diagnostics;
  }
}
export async function deleteTenantStore(tenantId: string, id: string) {
  const store = await prisma.store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      _count: { select: { orders: true } },
    },
  });

  if (!store) throw new StoreServiceError('STORE_NOT_FOUND');
  if (store._count.orders > 0) throw new StoreServiceError('STORE_HAS_ORDERS');

  const storesCount = await prisma.store.count({ where: { tenantId } });
  if (storesCount <= 1) throw new StoreServiceError('LAST_STORE_CANNOT_BE_DELETED');

  await prisma.$transaction([
    prisma.deliveryZone.deleteMany({ where: { tenantId, storeId: id } }),
    prisma.storePaymentMethod.deleteMany({ where: { tenantId, storeId: id } }),
    prisma.broadcastCampaign.deleteMany({ where: { tenantId, storeId: id } }),
    prisma.store.delete({ where: { id } }),
  ]);
}
