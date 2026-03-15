import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    product: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    category: { findFirst: vi.fn() },
    productVariant: { findFirst: vi.fn(), update: vi.fn() },
    productImage: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  },
  planGuard: vi.fn((_key: string) => async () => {}),
  // s3 / sharp stubs not needed — image tests are skipped
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));
vi.mock('../../lib/s3.js', () => ({
  uploadFile: vi.fn(),
  ensureBucket: vi.fn(),
  resolveBucketAndObjectPath: vi.fn(),
  buildProductImageObjectPath: vi.fn(),
}));

import productRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1' };
  });
  await app.register(productRoutes);
  return app;
}

describe('product.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── POST /products ────────────────────────────────────────────────────────

  describe('POST /products', () => {
    it('returns 400 for invalid schema (missing name)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/products',
        payload: { price: 5000 }, // no name
      });
      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.product.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when categoryId does not belong to tenant', async () => {
      mocks.prisma.category.findFirst.mockResolvedValue(null); // foreign category
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/products',
        payload: { name: 'Widget', price: 5000, categoryId: 'cat-foreign' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/category/i);
      expect(mocks.prisma.product.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('creates product with verified category', async () => {
      mocks.prisma.category.findFirst.mockResolvedValue({ id: 'cat-1' });
      mocks.prisma.product.create.mockResolvedValue({ id: 'p-1', name: 'Widget', variants: [], images: [] });
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/products',
        payload: { name: 'Widget', price: 5000, categoryId: 'cat-1' },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1', categoryId: 'cat-1' }),
        })
      );
      await app.close();
    });

    it('creates product without category (no category check)', async () => {
      mocks.prisma.product.create.mockResolvedValue({ id: 'p-1', name: 'Widget', variants: [], images: [] });
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/products',
        payload: { name: 'Widget', price: 5000 },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.category.findFirst).not.toHaveBeenCalled();
      await app.close();
    });
  });

  // ─── PATCH /products/:id ───────────────────────────────────────────────────

  describe('PATCH /products/:id', () => {
    it('returns 400 for invalid schema (negative price)', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/products/p-1',
        payload: { price: -1 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 404 when product not found for tenant', async () => {
      mocks.prisma.product.updateMany.mockResolvedValue({ count: 0 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/products/p-999',
        payload: { name: 'New name' },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('updates product with tenantId filter', async () => {
      mocks.prisma.product.updateMany.mockResolvedValue({ count: 1 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/products/p-1',
        payload: { name: 'New name', isActive: false },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) })
      );
      await app.close();
    });

    it('returns 400 when categoryId does not belong to tenant', async () => {
      mocks.prisma.category.findFirst.mockResolvedValue(null);
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/products/p-1',
        payload: { categoryId: 'cat-foreign' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  // ─── DELETE /products/:id ──────────────────────────────────────────────────

  describe('DELETE /products/:id', () => {
    it('returns 404 when product not found', async () => {
      mocks.prisma.product.updateMany.mockResolvedValue({ count: 0 });
      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/products/p-999' });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('soft-deletes product (sets isActive=false)', async () => {
      mocks.prisma.product.updateMany.mockResolvedValue({ count: 1 });
      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/products/p-1' });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } })
      );
      await app.close();
    });
  });

  // ─── PATCH /products/:id/stock ─────────────────────────────────────────────

  describe('PATCH /products/:id/stock', () => {
    it('updates product stock directly', async () => {
      mocks.prisma.product.updateMany.mockResolvedValue({ count: 1 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/products/p-1/stock',
        payload: { qty: 50 },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
          data: { stockQty: 50 },
        })
      );
      await app.close();
    });

    it('returns 404 when variant not found (tenant isolation check)', async () => {
      // variant lookup uses nested product.tenantId filter
      mocks.prisma.productVariant.findFirst.mockResolvedValue(null);
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/products/p-1/stock',
        payload: { qty: 10, variantId: 'var-foreign' },
      });
      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.productVariant.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('updates variant stock when variant belongs to tenant product', async () => {
      mocks.prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1' });
      mocks.prisma.productVariant.update.mockResolvedValue({ id: 'var-1', stockQty: 10 });
      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/products/p-1/stock',
        payload: { qty: 10, variantId: 'var-1' },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.productVariant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            product: { tenantId: 'tenant-1' },
          }),
        })
      );
      await app.close();
    });
  });
});
