import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    broadcastCampaign: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    store: { findFirst: vi.fn() },
    customer: { findMany: vi.fn() },
  },
  sendPromoBroadcast: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../bot/bot-manager.js', () => ({ sendPromoBroadcast: mocks.sendPromoBroadcast }));

import broadcastRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1' };
  });
  await app.register(broadcastRoutes);
  return app;
}

describe('broadcast.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('POST /broadcasts/send', () => {
    it('returns 400 for invalid schema', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/broadcasts/send',
        payload: { targetType: 'INVALID' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 404 when store does not belong to tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/broadcasts/send',
        payload: { storeId: 'store-foreign', message: 'Hello', targetType: 'ALL' },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('returns 400 for SELECTED mode with no customerIds', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/broadcasts/send',
        payload: { storeId: 'store-1', message: 'Hello', targetType: 'SELECTED', customerIds: [] },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/customerIds/i);
      await app.close();
    });

    it('returns 400 when no recipients found', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.customer.findMany.mockResolvedValue([]); // ALL mode, no customers
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/broadcasts/send',
        payload: { storeId: 'store-1', message: 'Hello', targetType: 'ALL' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/recipients/i);
      await app.close();
    });

    it('filters SELECTED recipients by tenantId to prevent cross-tenant injection', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.customer.findMany.mockResolvedValue([
        { id: 'c-1', telegramId: 111n, firstName: 'Alice' },
      ]);
      mocks.prisma.broadcastCampaign.create.mockResolvedValue({ id: 'bc-1' });
      mocks.prisma.broadcastCampaign.update.mockResolvedValue({});
      mocks.sendPromoBroadcast.mockResolvedValue({ sent: 1, failed: 0 });

      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/broadcasts/send',
        payload: {
          storeId: 'store-1',
          message: 'Promo',
          targetType: 'SELECTED',
          customerIds: ['c-1', 'c-foreign'],
        },
      });

      // The final customer lookup must scope by tenantId regardless of provided IDs
      expect(mocks.prisma.customer.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
        })
      );
      await app.close();
    });

    it('sends ALL broadcast and updates campaign status', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.customer.findMany.mockResolvedValue([
        { id: 'c-1', telegramId: 111n, firstName: 'Alice' },
        { id: 'c-2', telegramId: 222n, firstName: 'Bob' },
      ]);
      mocks.prisma.broadcastCampaign.create.mockResolvedValue({ id: 'bc-1' });
      mocks.prisma.broadcastCampaign.update.mockResolvedValue({});
      mocks.sendPromoBroadcast.mockResolvedValue({ sent: 2, failed: 0 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/broadcasts/send',
        payload: { storeId: 'store-1', message: 'Big sale!', targetType: 'ALL' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({ total: 2, sent: 2, failed: 0 });
      expect(mocks.prisma.broadcastCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) })
      );
      await app.close();
    });

    it('marks campaign FAILED when all sends fail', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.customer.findMany.mockResolvedValue([
        { id: 'c-1', telegramId: 111n, firstName: 'Alice' },
      ]);
      mocks.prisma.broadcastCampaign.create.mockResolvedValue({ id: 'bc-1' });
      mocks.prisma.broadcastCampaign.update.mockResolvedValue({});
      mocks.sendPromoBroadcast.mockResolvedValue({ sent: 0, failed: 1 });

      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/broadcasts/send',
        payload: { storeId: 'store-1', message: 'Hello', targetType: 'ALL' },
      });

      expect(mocks.prisma.broadcastCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
      );
      await app.close();
    });
  });
});
