import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import categoryRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
  });
  await app.register(categoryRoutes);
  return app;
}

describe('category.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('PATCH /categories/:id', () => {
    it('returns 400 (not 500) for invalid payload', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/categories/cat-1',
        payload: { sortOrder: 'not-a-number' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 404 when category not found for tenant', async () => {
      mocks.prisma.category.updateMany.mockResolvedValue({ count: 0 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/categories/cat-1',
        payload: { name: 'Electronics' },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('updates category and returns 200', async () => {
      mocks.prisma.category.updateMany.mockResolvedValue({ count: 1 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/categories/cat-1',
        payload: { name: 'Electronics' },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.category.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) })
      );
      await app.close();
    });
  });

  describe('DELETE /categories/:id', () => {
    it('returns 404 when category not found', async () => {
      mocks.prisma.category.updateMany.mockResolvedValue({ count: 0 });
      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/categories/cat-999' });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('soft-deletes category (sets isActive=false)', async () => {
      mocks.prisma.category.updateMany.mockResolvedValue({ count: 1 });
      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/categories/cat-1' });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.category.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } })
      );
      await app.close();
    });
  });
});
