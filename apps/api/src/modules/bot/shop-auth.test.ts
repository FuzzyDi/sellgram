import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateInitData: vi.fn(),
  decrypt: vi.fn(),
  getConfig: vi.fn(),
  prisma: {
    store: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../lib/telegram-auth.js', () => ({
  validateInitData: mocks.validateInitData,
}));
vi.mock('../../lib/encrypt.js', () => ({ decrypt: mocks.decrypt }));
vi.mock('../../config/index.js', () => ({ getConfig: mocks.getConfig }));

import { telegramShopAuth } from './shop-auth.js';

function buildReply() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  return { status, send };
}

describe('shop-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({ MINIAPP_INITDATA_MAX_AGE_SEC: 600, ALLOW_DEV_AUTH_BYPASS: false });
  });

  it('returns 401 when store id header is missing', async () => {
    const request: any = { headers: {} };
    const reply = buildReply();

    await telegramShopAuth(request, reply as any);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: 'Missing store ID' });
  });

  it('sets customer when initData is valid', async () => {
    const request: any = { headers: { 'x-store-id': 's-1', 'x-telegram-init-data': 'abc' } };
    const reply = buildReply();

    mocks.prisma.store.findUnique.mockResolvedValue({ id: 's-1', isActive: true, tenantId: 't-1', botToken: 'enc' });
    mocks.decrypt.mockReturnValue('plain-token');
    mocks.validateInitData.mockReturnValue({ id: 123, username: 'u' });
    mocks.prisma.customer.findUnique.mockResolvedValue({ id: 'c-1' });

    await telegramShopAuth(request, reply as any);

    expect(request.storeId).toBe('s-1');
    expect(request.customer).toEqual({ id: 'c-1', tenantId: 't-1' });
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 401 when auth fails and bypass is disabled', async () => {
    const request: any = { headers: { 'x-store-id': 's-1' } };
    const reply = buildReply();

    mocks.prisma.store.findUnique.mockResolvedValue({ id: 's-1', isActive: true, tenantId: 't-1', botToken: 'enc' });
    mocks.prisma.customer.findFirst.mockResolvedValue(null);

    await telegramShopAuth(request, reply as any);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: 'Auth failed' });
  });
});
