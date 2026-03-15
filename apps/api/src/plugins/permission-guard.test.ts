import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mocks.prisma }));

import { permissionGuard } from './permission-guard.js';

function makeRequest(userOverrides?: Partial<{ userId: string; role: string; tenantId: string }>) {
  return {
    user: userOverrides === undefined
      ? undefined
      : { userId: 'u-1', tenantId: 't-1', role: 'OPERATOR', ...userOverrides },
  } as any;
}

function makeReply() {
  const reply = {
    _status: 0,
    _body: null as any,
    status(code: number) { this._status = code; return this; },
    send(body: any) { this._body = body; return this; },
  };
  return reply;
}

describe('permissionGuard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when request.user is missing', async () => {
    const guard = permissionGuard('manageOrders');
    const reply = makeReply();
    await guard(makeRequest(undefined), reply as any);
    expect(reply._status).toBe(401);
  });

  it('passes active OWNER (does DB lookup to check isActive)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'OWNER', isActive: true, permissions: null });
    const guard = permissionGuard('manageOrders');
    const reply = makeReply();
    await guard(makeRequest({ role: 'OWNER' }), reply as any);
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(reply._status).toBe(0); // never called status()
  });

  it('returns 403 for inactive OWNER (deactivated accounts must be blocked)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'OWNER', isActive: false, permissions: null });
    const guard = permissionGuard('manageOrders');
    const reply = makeReply();
    await guard(makeRequest({ role: 'OWNER' }), reply as any);
    expect(reply._status).toBe(403);
  });

  it('passes active MANAGER (does DB lookup to check isActive)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'MANAGER', isActive: true, permissions: null });
    const guard = permissionGuard('manageCatalog');
    const reply = makeReply();
    await guard(makeRequest({ role: 'MANAGER' }), reply as any);
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(reply._status).toBe(0);
  });

  it('passes OPERATOR with the required permission enabled', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      role: 'OPERATOR',
      isActive: true,
      permissions: { manageOrders: true },
    });
    const guard = permissionGuard('manageOrders');
    const reply = makeReply();
    await guard(makeRequest({ role: 'OPERATOR' }), reply as any);
    expect(reply._status).toBe(0);
  });

  it('returns 403 for OPERATOR missing the required permission', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      role: 'OPERATOR',
      isActive: true,
      permissions: { manageOrders: false },
    });
    const guard = permissionGuard('manageOrders');
    const reply = makeReply();
    await guard(makeRequest({ role: 'OPERATOR' }), reply as any);
    expect(reply._status).toBe(403);
  });

  it('returns 403 for inactive OPERATOR', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      role: 'OPERATOR',
      isActive: false,
      permissions: { manageOrders: true },
    });
    const guard = permissionGuard('manageOrders');
    const reply = makeReply();
    await guard(makeRequest({ role: 'OPERATOR' }), reply as any);
    expect(reply._status).toBe(403);
  });

  it('applies default OPERATOR permissions when permissions field is null', async () => {
    // OPERATOR_DEFAULT_PERMISSIONS has manageOrders: true and manageSettings: false
    mocks.prisma.user.findUnique.mockResolvedValue({
      role: 'OPERATOR',
      isActive: true,
      permissions: null,
    });

    const orderGuard = permissionGuard('manageOrders');
    const settingsGuard = permissionGuard('manageSettings');
    const replyOk = makeReply();
    const replyFail = makeReply();

    await orderGuard(makeRequest({ role: 'OPERATOR' }), replyOk as any);
    await settingsGuard(makeRequest({ role: 'OPERATOR' }), replyFail as any);

    expect(replyOk._status).toBe(0);
    expect(replyFail._status).toBe(403);
  });
});
