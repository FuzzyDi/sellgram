import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    webhook: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  planGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));

import webhookAdminRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1' };
  });
  await app.register(webhookAdminRoutes);
  return app;
}

describe('webhook.routes — isSafeWebhookUrl (SSRF guard on create)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('accepts a public https URL', async () => {
    mocks.prisma.webhook.create.mockResolvedValue({ id: 'wh-1', url: 'https://example.com/hook', events: ['*'], isActive: true, createdAt: new Date(), secret: 's' });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks',
      payload: { url: 'https://example.com/hook', events: ['*'] },
    });

    expect(response.statusCode).toBe(201);
    expect(mocks.prisma.webhook.create).toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ['http://example.com/hook', 'non-https scheme'],
    ['https://localhost/hook', 'localhost'],
    ['https://127.0.0.1/hook', 'IPv4 loopback literal'],
    ['https://169.254.169.254/hook', 'IPv4 cloud metadata literal'],
    ['https://10.0.0.5/hook', 'RFC1918 literal'],
    ['https://[::1]/hook', 'IPv6 loopback literal'],
    ['https://[fe80::1]/hook', 'IPv6 link-local literal'],
    ['https://[fc00::1]/hook', 'IPv6 unique-local literal'],
    ['https://[::ffff:169.254.169.254]/hook', 'IPv4-mapped IPv6 metadata literal'],
    ['https://redis/hook', 'internal Docker service name'],
    ['not-a-url', 'malformed URL'],
  ])('rejects %s (%s) with 400 and does not create a row', async (url) => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks',
      payload: { url, events: ['*'] },
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.prisma.webhook.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('applies the same validation to PATCH /webhooks/:id', async () => {
    mocks.prisma.webhook.findFirst.mockResolvedValue({ id: 'wh-1' });

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/webhooks/wh-1',
      payload: { url: 'https://169.254.169.254/hook' },
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.prisma.webhook.update).not.toHaveBeenCalled();
    await app.close();
  });
});
