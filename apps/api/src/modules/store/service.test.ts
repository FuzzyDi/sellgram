import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  getConfig: vi.fn(),
  botInit: vi.fn(),
  setChatMenuButton: vi.fn(),
  setWebhook: vi.fn(),
  prisma: {
    store: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../lib/encrypt.js', () => ({
  encrypt: mocks.encrypt,
  decrypt: mocks.decrypt,
}));

vi.mock('../../config/index.js', () => ({
  getConfig: mocks.getConfig,
}));

vi.mock('../../lib/prisma.js', () => ({
  default: mocks.prisma,
}));

vi.mock('grammy', () => ({
  Bot: vi.fn().mockImplementation(() => ({
    init: mocks.botInit,
    api: {
      setChatMenuButton: mocks.setChatMenuButton,
      setWebhook: mocks.setWebhook,
    },
  })),
}));

import {
  activateTenantStoreBot,
  createTenantStore,
  StoreServiceError,
  updateTenantStore,
} from './service.js';

describe('store.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates store with encrypted bot token and default payment method', async () => {
    mocks.encrypt.mockReturnValue('enc-token');
    mocks.prisma.store.create.mockResolvedValue({ id: 's-1' });

    const result = await createTenantStore('t-1', {
      name: 'Demo Store',
      botToken: 'plain-token-123',
      welcomeMessage: 'Hello',
    });

    expect(mocks.encrypt).toHaveBeenCalledWith('plain-token-123');
    expect(mocks.prisma.store.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 's-1' });
  });

  it('throws STORE_NOT_FOUND when update target does not exist', async () => {
    mocks.prisma.store.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateTenantStore('t-1', 'missing', { name: 'New' })
    ).rejects.toMatchObject({ code: 'STORE_NOT_FOUND' } satisfies Partial<StoreServiceError>);
  });

  it('throws WEBHOOK_BASE_URL_NOT_CONFIGURED on activate when APP_URL is empty', async () => {
    mocks.prisma.store.findFirst.mockResolvedValue({
      id: 's-1',
      botToken: 'enc',
      miniAppUrl: null,
      webhookSecret: 'sec',
      isActive: true,
    });
    mocks.getConfig.mockReturnValue({ APP_URL: '   ' });

    await expect(activateTenantStoreBot('t-1', 's-1')).rejects.toMatchObject({
      code: 'WEBHOOK_BASE_URL_NOT_CONFIGURED',
    } satisfies Partial<StoreServiceError>);
  });

  it('activates store bot and sets webhook', async () => {
    mocks.prisma.store.findFirst.mockResolvedValue({
      id: 's-1',
      botToken: 'enc',
      miniAppUrl: 'https://miniapp.sellgram.uz',
      webhookSecret: 'secret-1',
      isActive: true,
    });
    mocks.getConfig.mockReturnValue({ APP_URL: 'https://api.sellgram.uz' });
    mocks.decrypt.mockReturnValue('plain-token');
    mocks.botInit.mockResolvedValue(undefined);
    mocks.setChatMenuButton.mockResolvedValue(undefined);
    mocks.setWebhook.mockResolvedValue(undefined);
    mocks.prisma.store.update.mockResolvedValue({});

    const result = await activateTenantStoreBot('t-1', 's-1');

    expect(mocks.decrypt).toHaveBeenCalledWith('enc');
    expect(mocks.setWebhook).toHaveBeenCalledWith('https://api.sellgram.uz/webhook/s-1', {
      secret_token: 'secret-1',
      drop_pending_updates: false,
    });
    expect(result.storeId).toBe('s-1');
  });
});
