import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    posDevice: { findMany: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
  },
  sendMessageToOwner: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../bot/bot-manager.js', () => ({ sendMessageToOwner: mocks.sendMessageToOwner }));

import { checkOfflineDevices } from './pos-device-monitor.js';

const OWNER = { adminTelegramId: 123456789n };

function offlineDevice(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'dev-1',
    name: 'Касса у входа',
    tenantId: 'tenant-1',
    lastSeenAt: new Date(Date.now() - 20 * 60 * 1000), // 20 min ago
    store: { name: 'Central store' },
    ...overrides,
  };
}

describe('pos-device-monitor.checkOfflineDevices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a Telegram alert for a device offline more than 15 minutes with no prior alert', async () => {
    mocks.prisma.posDevice.findMany.mockResolvedValue([offlineDevice()]);
    mocks.prisma.user.findFirst.mockResolvedValue(OWNER);
    mocks.sendMessageToOwner.mockResolvedValue(true);

    await checkOfflineDevices();

    expect(mocks.sendMessageToOwner).toHaveBeenCalledTimes(1);
    const [tenantId, telegramId, message] = mocks.sendMessageToOwner.mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(telegramId).toBe(123456789n);
    expect(message).toContain('Касса у входа');
    expect(message).toContain('Central store');
    expect(message).toContain('20 минут');
  });

  it('queries only ACTIVE devices whose lastSeenAt is older than 15 minutes', async () => {
    mocks.prisma.posDevice.findMany.mockResolvedValue([]);

    const before = Date.now();
    await checkOfflineDevices();
    const after = Date.now();

    const call = mocks.prisma.posDevice.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('ACTIVE');
    const cutoff = call.where.lastSeenAt.lt.getTime();
    // cutoff should be ~15 minutes before "now" at call time
    expect(cutoff).toBeGreaterThanOrEqual(before - 15 * 60 * 1000 - 1000);
    expect(cutoff).toBeLessThanOrEqual(after - 15 * 60 * 1000 + 1000);
  });

  it('includes the alertSentAt dedup window (null or older than 1 hour) in the query', async () => {
    mocks.prisma.posDevice.findMany.mockResolvedValue([]);
    await checkOfflineDevices();

    const call = mocks.prisma.posDevice.findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { alertSentAt: null },
      { alertSentAt: { lt: expect.any(Date) } },
    ]);
    const realertCutoff = call.where.OR[1].alertSentAt.lt.getTime();
    expect(Date.now() - realertCutoff).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
    expect(Date.now() - realertCutoff).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
  });

  it('does not send anything when no devices match (e.g. all within 15 min or recently alerted)', async () => {
    mocks.prisma.posDevice.findMany.mockResolvedValue([]);
    await checkOfflineDevices();
    expect(mocks.sendMessageToOwner).not.toHaveBeenCalled();
    expect(mocks.prisma.posDevice.update).not.toHaveBeenCalled();
  });

  it('updates alertSentAt after a successful send', async () => {
    mocks.prisma.posDevice.findMany.mockResolvedValue([offlineDevice()]);
    mocks.prisma.user.findFirst.mockResolvedValue(OWNER);
    mocks.sendMessageToOwner.mockResolvedValue(true);

    await checkOfflineDevices();

    expect(mocks.prisma.posDevice.update).toHaveBeenCalledWith({
      where: { id: 'dev-1' },
      data: { alertSentAt: expect.any(Date) },
    });
  });

  it('does not update alertSentAt when the Telegram send fails', async () => {
    mocks.prisma.posDevice.findMany.mockResolvedValue([offlineDevice()]);
    mocks.prisma.user.findFirst.mockResolvedValue(OWNER);
    mocks.sendMessageToOwner.mockResolvedValue(false);

    await checkOfflineDevices();

    expect(mocks.prisma.posDevice.update).not.toHaveBeenCalled();
  });

  it('skips a device whose tenant has no OWNER with a linked Telegram account', async () => {
    mocks.prisma.posDevice.findMany.mockResolvedValue([offlineDevice()]);
    mocks.prisma.user.findFirst.mockResolvedValue(null);

    await checkOfflineDevices();

    expect(mocks.sendMessageToOwner).not.toHaveBeenCalled();
    expect(mocks.prisma.posDevice.update).not.toHaveBeenCalled();
  });

  it('continues processing remaining devices if one throws', async () => {
    mocks.prisma.posDevice.findMany.mockResolvedValue([
      offlineDevice({ id: 'dev-1' }),
      offlineDevice({ id: 'dev-2' }),
    ]);
    mocks.prisma.user.findFirst.mockResolvedValue(OWNER);
    mocks.sendMessageToOwner
      .mockRejectedValueOnce(new Error('telegram down'))
      .mockResolvedValueOnce(true);

    await checkOfflineDevices();

    expect(mocks.sendMessageToOwner).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.posDevice.update).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.posDevice.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dev-2' } })
    );
  });
});
