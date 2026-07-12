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
  permissionGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

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

  describe('GET /categories', () => {
    it('returns parentId on each category (hierarchy support)', async () => {
      mocks.prisma.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Root', slug: 'root', sortOrder: 0, isActive: true, parentId: null },
        { id: 'cat-2', name: 'Child', slug: 'child', sortOrder: 0, isActive: true, parentId: 'cat-1' },
      ]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/categories' });

      expect(response.statusCode).toBe(200);
      const { data } = response.json();
      expect(data).toEqual([
        expect.objectContaining({ id: 'cat-1', parentId: null }),
        expect.objectContaining({ id: 'cat-2', parentId: 'cat-1' }),
      ]);

      // parentId reaching the client relies on the route using Prisma's
      // `include` (which always returns every scalar column alongside
      // the requested relations) rather than a `select` that would need
      // parentId listed explicitly — assert that shape so a future
      // switch to `select` can't silently drop it again.
      const call = mocks.prisma.category.findMany.mock.calls[0][0];
      expect(call).toHaveProperty('include');
      expect(call).not.toHaveProperty('select');
      await app.close();
    });
  });

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
