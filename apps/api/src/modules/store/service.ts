import { Bot } from 'grammy';
import prisma from '../../lib/prisma.js';
import { getConfig } from '../../config/index.js';
import { decrypt, encrypt } from '../../lib/encrypt.js';
import type { CreateStoreInput, UpdateStoreInput } from './dto.js';

export class StoreServiceError extends Error {
  code: 'STORE_NOT_FOUND' | 'STORE_INACTIVE' | 'WEBHOOK_BASE_URL_NOT_CONFIGURED';

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

  return prisma.store.create({
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

  return { storeId: store.id, webhookUrl, miniAppUrl };
}
