import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    priceRevision: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    priceRevisionItem: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  permissionGuard: vi.fn((_key: string) => async () => {}),
  planGuard: vi.fn((_key: string) => async () => {}),
  triggerCatalogRefresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));
vi.mock('../pos-sync/admin-routes.js', () => ({ triggerCatalogRefresh: mocks.triggerCatalogRefresh }));

import priceRevisionRoutes from './price-revision-routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1', role: 'OWNER' };
  });
  await app.register(priceRevisionRoutes);
  return app;
}

describe('price-revision.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('POST /price-revisions', () => {
    it('snapshots effective old prices per channel and stores the requested new prices', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', price: 1000, posPrice: null, wholesalePrice: 800 },
      ]);
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        priceRevision: {
          findFirst: vi.fn().mockResolvedValue({ revisionNumber: 1 }),
          create: vi.fn().mockResolvedValue({ id: 'pr-1', revisionNumber: 2, items: [] }),
        },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/price-revisions',
        payload: { items: [{ productId: 'p-1', newPrice: 1200, newPosPrice: 1100 }] },
      });

      expect(response.statusCode).toBe(200);
      expect(tx.priceRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            revisionNumber: 2,
            items: {
              create: [
                expect.objectContaining({
                  productId: 'p-1',
                  oldPrice: 1000,
                  oldPosPrice: 1000, // posPrice null -> falls back to price
                  oldWholesalePrice: 800,
                  newPrice: 1200,
                  newPosPrice: 1100,
                  newWholesalePrice: null,
                }),
              ],
            },
          }),
        })
      );
      await app.close();
    });

    it('rejects an item with no new price on any channel', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/price-revisions',
        payload: { items: [{ productId: 'p-1' }] },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects a product not belonging to the tenant', async () => {
      mocks.prisma.product.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/price-revisions',
        payload: { items: [{ productId: 'p-foreign', newPrice: 500 }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/invalid/i);
      await app.close();
    });
  });

  describe('PATCH /price-revisions/:id', () => {
    function makePatchTx(revision: any) {
      const tx = { priceRevision: { findFirst: vi.fn().mockResolvedValue(revision), update: vi.fn().mockResolvedValue({}) } };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('rejects a direct CONFIRMED transition', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/price-revisions/pr-1', payload: { status: 'CONFIRMED' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('allows DRAFT -> CANCELLED', async () => {
      const tx = makePatchTx({ id: 'pr-1', status: 'DRAFT' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/price-revisions/pr-1', payload: { status: 'CANCELLED' } });
      expect(response.statusCode).toBe(200);
      expect(tx.priceRevision.update).toHaveBeenCalledWith({ where: { id: 'pr-1' }, data: { status: 'CANCELLED' } });
      await app.close();
    });

    it('rejects editing an already-CONFIRMED revision', async () => {
      makePatchTx({ id: 'pr-1', status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/price-revisions/pr-1', payload: { note: 'oops' } });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /price-revisions/:id/confirm', () => {
    const baseRevision = {
      id: 'pr-1', status: 'DRAFT', revisionNumber: 1,
      items: [
        { id: 'pri-1', productId: 'p-1', newPrice: 1200, newPosPrice: 1100, newWholesalePrice: null },
        { id: 'pri-2', productId: 'p-2', newPrice: null, newPosPrice: null, newWholesalePrice: null }, // no-op, skipped
      ],
    };

    function makeConfirmTx() {
      const tx = {
        product: { findFirst: vi.fn().mockResolvedValue({ id: 'p-1' }), update: vi.fn().mockResolvedValue({}) },
        priceRevision: { update: vi.fn().mockResolvedValue({}) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      return tx;
    }

    it('sets price/posPrice for the changed channels only, skips the no-op item, and refreshes the POS catalog', async () => {
      mocks.prisma.priceRevision.findFirst.mockResolvedValue(baseRevision);
      const tx = makeConfirmTx();

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/price-revisions/pr-1/confirm' });

      expect(response.statusCode).toBe(200);
      expect(tx.product.update).toHaveBeenCalledTimes(1);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' }, data: { price: 1200, posPrice: 1100 },
      });
      expect(tx.priceRevision.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' }, data: expect.objectContaining({ status: 'CONFIRMED' }),
      });
      expect(mocks.triggerCatalogRefresh).toHaveBeenCalledWith('tenant-1');
      await app.close();
    });

    it('rejects confirming an already-CONFIRMED revision', async () => {
      mocks.prisma.priceRevision.findFirst.mockResolvedValue({ ...baseRevision, status: 'CONFIRMED' });
      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/price-revisions/pr-1/confirm' });
      expect(response.statusCode).toBe(400);
      expect(mocks.triggerCatalogRefresh).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when a product does not belong to the tenant (rolled back, no catalog refresh)', async () => {
      mocks.prisma.priceRevision.findFirst.mockResolvedValue(baseRevision);
      const tx = makeConfirmTx();
      tx.product.findFirst = vi.fn().mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'POST', url: '/price-revisions/pr-1/confirm' });

      expect(response.statusCode).toBe(400);
      expect(tx.priceRevision.update).not.toHaveBeenCalled();
      expect(mocks.triggerCatalogRefresh).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('line-item CRUD', () => {
    it('adds an item while DRAFT, snapshotting effective old prices', async () => {
      const tx = {
        priceRevision: { findFirst: vi.fn().mockResolvedValue({ id: 'pr-1', status: 'DRAFT', items: [] }) },
        product: { findFirst: vi.fn().mockResolvedValue({ id: 'p-2', price: 500, posPrice: 600, wholesalePrice: null }) },
        priceRevisionItem: { create: vi.fn().mockResolvedValue({ id: 'pri-new' }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/price-revisions/pr-1/items',
        payload: { productId: 'p-2', newWholesalePrice: 450 },
      });

      expect(response.statusCode).toBe(201);
      expect(tx.priceRevisionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oldPrice: 500, oldPosPrice: 600, oldWholesalePrice: 500,
            newPrice: null, newPosPrice: null, newWholesalePrice: 450,
          }),
        })
      );
      await app.close();
    });

    it('rejects item edits once CONFIRMED', async () => {
      const tx = {
        priceRevision: { findFirst: vi.fn().mockResolvedValue({ id: 'pr-1', status: 'CONFIRMED', items: [{ id: 'pri-1' }] }) },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/price-revisions/pr-1/items/pri-1',
        payload: { newPrice: 999 },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('refuses to delete the last remaining item', async () => {
      const tx = {
        priceRevision: { findFirst: vi.fn().mockResolvedValue({ id: 'pr-1', status: 'DRAFT', items: [{ id: 'pri-1' }] }) },
        priceRevisionItem: { delete: vi.fn() },
      };
      mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/price-revisions/pr-1/items/pri-1' });

      expect(response.statusCode).toBe(400);
      expect(tx.priceRevisionItem.delete).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
