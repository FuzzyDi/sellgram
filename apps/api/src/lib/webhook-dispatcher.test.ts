import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: { webhook: { findMany: vi.fn() } },
  lookup: vi.fn(),
}));

vi.mock('./prisma.js', () => ({ default: mocks.prisma }));
vi.mock('dns/promises', () => ({ lookup: mocks.lookup }));

import { dispatchWebhook } from './webhook-dispatcher.js';

function flushMicrotasks() {
  return new Promise((r) => setImmediate(r));
}

describe('dispatchWebhook — SSRF re-check at delivery time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('delivers when the hostname currently resolves to a public address', async () => {
    mocks.prisma.webhook.findMany.mockResolvedValue([
      { id: 'wh-1', url: 'https://example.com/hook', events: ['*'], secret: 's' },
    ]);
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);

    await dispatchWebhook('tenant-1', 'order.created', { id: 'o-1' });
    await flushMicrotasks();

    expect(mocks.lookup).toHaveBeenCalledWith('example.com', { all: true });
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/hook', expect.any(Object));
  });

  // The scenario the fix closes: a webhook created against a public
  // hostname is validated once at creation time, then the tenant
  // repoints that domain's DNS at an internal address before the next
  // delivery — the dispatcher must catch this at send time, not just
  // trust the URL that passed validation earlier.
  it('refuses to deliver when the hostname currently resolves to a private address, without retrying', async () => {
    mocks.prisma.webhook.findMany.mockResolvedValue([
      { id: 'wh-1', url: 'https://rebound.example.com/hook', events: ['*'], secret: 's' },
    ]);
    mocks.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    await dispatchWebhook('tenant-1', 'order.created', { id: 'o-1' });
    await flushMicrotasks();

    expect(global.fetch).not.toHaveBeenCalled();
    // One lookup only — a DNS-resolution block doesn't get the 3s-delay retry
    // a transient network error would, since re-resolving immediately would
    // return the same private address.
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it('refuses to deliver when any one of multiple resolved addresses is private', async () => {
    mocks.prisma.webhook.findMany.mockResolvedValue([
      { id: 'wh-1', url: 'https://multi.example.com/hook', events: ['*'], secret: 's' },
    ]);
    mocks.lookup.mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);

    await dispatchWebhook('tenant-1', 'order.created', { id: 'o-1' });
    await flushMicrotasks();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips webhooks not subscribed to this event without resolving DNS at all', async () => {
    mocks.prisma.webhook.findMany.mockResolvedValue([
      { id: 'wh-1', url: 'https://example.com/hook', events: ['customer.created'], secret: 's' },
    ]);

    await dispatchWebhook('tenant-1', 'order.created', { id: 'o-1' });
    await flushMicrotasks();

    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
