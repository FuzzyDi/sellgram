import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySystemToken: vi.fn(),
  prisma: {
    platformPolicy: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    platformPolicyVersion: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../lib/system-jwt.js', () => ({
  verifySystemToken: mocks.verifySystemToken,
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import policyRoutes from './policy-routes.js';

const AUTH = { authorization: 'Bearer valid-token' };
const VALID_ADMIN = { type: 'system_admin', adminId: 'sa-1', email: 'root@sellgram.uz' };

async function buildApp() {
  const app = Fastify();
  await app.register(policyRoutes);
  return app;
}

function mockTransaction() {
  mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(mocks.prisma));
}

describe('policy.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySystemToken.mockResolvedValue(VALID_ADMIN);
  });

  // ─── Auth ───────────────────────────────────────────────────────────────

  it('rejects requests without a bearer token', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/platform-policies' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects requests with an invalid token', async () => {
    mocks.verifySystemToken.mockRejectedValue(new Error('bad token'));
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/platform-policies',
      headers: AUTH,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  // ─── GET /platform-policies ─────────────────────────────────────────────

  it('lists platform policies', async () => {
    mocks.prisma.platformPolicy.findMany.mockResolvedValue([{ id: 'p-1', scope: 'PAYMENT' }]);
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/platform-policies', headers: AUTH });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([{ id: 'p-1', scope: 'PAYMENT' }]);
    await app.close();
  });

  // ─── GET /platform-policies/version ─────────────────────────────────────

  it('returns the current policy version', async () => {
    mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ id: 'v-1', version: 4 });
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/platform-policies/version', headers: AUTH });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ version: 4 });
    await app.close();
  });

  it('defaults version to 1 when no counter row exists yet', async () => {
    mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue(null);
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/platform-policies/version', headers: AUTH });
    expect(response.json().data).toEqual({ version: 1 });
    await app.close();
  });

  // ─── POST /platform-policies ─────────────────────────────────────────────

  it('creates a policy and bumps the version', async () => {
    mockTransaction();
    mocks.prisma.platformPolicy.create.mockResolvedValue({ id: 'p-2', scope: 'PAYMENT', severity: 'BLOCK' });
    mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ id: 'v-1', version: 1 });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/platform-policies',
      headers: AUTH,
      payload: {
        scope: 'PAYMENT',
        severity: 'BLOCK',
        enabled: true,
        match: { categorySlugs: ['tobacco'] },
        message: { ru: 'Нельзя', uz: "Mumkin emas" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.prisma.platformPolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scope: 'PAYMENT', severity: 'BLOCK', enabled: true }),
    });
    expect(mocks.prisma.platformPolicyVersion.update).toHaveBeenCalledWith({
      where: { id: 'v-1' },
      data: { version: { increment: 1 } },
    });
    await app.close();
  });

  it('returns 400 for an invalid scope', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/platform-policies',
      headers: AUTH,
      payload: {
        scope: 'NOT_A_SCOPE',
        severity: 'BLOCK',
        match: {},
        message: { ru: 'x', uz: 'x' },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.prisma.platformPolicy.create).not.toHaveBeenCalled();
    await app.close();
  });

  // ─── PATCH /platform-policies/:id ────────────────────────────────────────

  it('updates a policy and bumps the version', async () => {
    mockTransaction();
    mocks.prisma.platformPolicy.findUnique.mockResolvedValue({ id: 'p-1', scope: 'PAYMENT' });
    mocks.prisma.platformPolicy.update.mockResolvedValue({ id: 'p-1', enabled: false });
    mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/platform-policies/p-1',
      headers: AUTH,
      payload: { enabled: false },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.prisma.platformPolicy.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { enabled: false },
    });
    expect(mocks.prisma.platformPolicyVersion.create).toHaveBeenCalledWith({ data: { version: 1 } });
    await app.close();
  });

  it('returns 404 when updating a policy that does not exist', async () => {
    mocks.prisma.platformPolicy.findUnique.mockResolvedValue(null);
    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/platform-policies/missing',
      headers: AUTH,
      payload: { enabled: false },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  // ─── DELETE /platform-policies/:id ───────────────────────────────────────

  it('deletes a policy and bumps the version', async () => {
    mockTransaction();
    mocks.prisma.platformPolicy.findUnique.mockResolvedValue({ id: 'p-1' });
    mocks.prisma.platformPolicyVersion.findFirst.mockResolvedValue({ id: 'v-1', version: 2 });

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/platform-policies/p-1',
      headers: AUTH,
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.prisma.platformPolicy.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
    expect(mocks.prisma.platformPolicyVersion.update).toHaveBeenCalledWith({
      where: { id: 'v-1' },
      data: { version: { increment: 1 } },
    });
    await app.close();
  });

  it('returns 404 when deleting a policy that does not exist', async () => {
    mocks.prisma.platformPolicy.findUnique.mockResolvedValue(null);
    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/platform-policies/missing',
      headers: AUTH,
    });
    expect(response.statusCode).toBe(404);
    expect(mocks.prisma.platformPolicy.delete).not.toHaveBeenCalled();
    await app.close();
  });
});
