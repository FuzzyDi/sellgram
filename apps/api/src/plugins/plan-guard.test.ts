import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    store: { count: vi.fn() },
    product: { count: vi.fn() },
    order: { count: vi.fn() },
    deliveryZone: { count: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mocks.prisma }));

import { planGuard } from './plan-guard.js';

function makeRequest(tenantId?: string) {
  return { tenantId } as any;
}

function makeReply() {
  const reply: any = {
    _status: 200,
    _body: null,
    status(code: number) { this._status = code; return this; },
    send(body: any) { this._body = body; return this; },
  };
  return reply;
}

describe('planGuard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when tenantId is missing', async () => {
    const reply = makeReply();
    await planGuard('maxStores')(makeRequest(undefined), reply);
    expect(reply._status).toBe(401);
  });

  it('returns 404 when tenant not found', async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);
    const reply = makeReply();
    await planGuard('maxStores')(makeRequest('t-1'), reply);
    expect(reply._status).toBe(404);
  });

  it('blocks boolean-false feature (FREE → procurementEnabled)', async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ plan: 'FREE' });
    const reply = makeReply();
    await planGuard('procurementEnabled')(makeRequest('t-1'), reply);
    expect(reply._status).toBe(402);
    expect(reply._body.error).toMatch(/procurementEnabled/);
  });

  it('passes boolean-true feature (PRO → loyaltyEnabled)', async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ plan: 'PRO' });
    const reply = makeReply();
    await planGuard('loyaltyEnabled')(makeRequest('t-1'), reply);
    expect(reply._body).toBeNull(); // hook did not send a response
  });

  it('passes numeric limit -1 (BUSINESS → maxProducts = unlimited)', async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ plan: 'BUSINESS' });
    const reply = makeReply();
    await planGuard('maxProducts')(makeRequest('t-1'), reply);
    expect(reply._body).toBeNull();
  });

  it('passes when current count is below the limit', async () => {
    // FREE: maxStores = 1, currently 0
    mocks.prisma.tenant.findUnique.mockResolvedValue({ plan: 'FREE' });
    mocks.prisma.store.count.mockResolvedValue(0);
    const reply = makeReply();
    await planGuard('maxStores')(makeRequest('t-1'), reply);
    expect(reply._body).toBeNull();
  });

  it('returns 402 when count is at the limit', async () => {
    // FREE: maxStores = 1, currently 1
    mocks.prisma.tenant.findUnique.mockResolvedValue({ plan: 'FREE' });
    mocks.prisma.store.count.mockResolvedValue(1);
    const reply = makeReply();
    await planGuard('maxStores')(makeRequest('t-1'), reply);
    expect(reply._status).toBe(402);
    expect(reply._body.currentCount).toBe(1);
    expect(reply._body.limit).toBe(1);
  });

  it('maxOrdersPerMonth uses UTC start-of-month date', async () => {
    // FREE: maxOrdersPerMonth = 50, currently 49 — should pass
    mocks.prisma.tenant.findUnique.mockResolvedValue({ plan: 'FREE' });
    mocks.prisma.order.count.mockResolvedValue(49);
    const reply = makeReply();
    await planGuard('maxOrdersPerMonth')(makeRequest('t-1'), reply);

    const callArgs = mocks.prisma.order.count.mock.calls[0][0];
    const gteDate: Date = callArgs.where.createdAt.gte;
    expect(gteDate.getUTCDate()).toBe(1);
    expect(gteDate.getUTCHours()).toBe(0);
    expect(gteDate.getUTCMinutes()).toBe(0);
    expect(gteDate.getUTCSeconds()).toBe(0);
    expect(reply._body).toBeNull();
  });

  it('returns 402 when maxOrdersPerMonth is reached', async () => {
    // FREE: maxOrdersPerMonth = 50
    mocks.prisma.tenant.findUnique.mockResolvedValue({ plan: 'FREE' });
    mocks.prisma.order.count.mockResolvedValue(50);
    const reply = makeReply();
    await planGuard('maxOrdersPerMonth')(makeRequest('t-1'), reply);
    expect(reply._status).toBe(402);
  });
});
