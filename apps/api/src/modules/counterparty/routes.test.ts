import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    counterparty: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    supplier: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
    productVariant: { findFirst: vi.fn() },
    counterpartyPrice: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  permissionGuard: vi.fn((_key: string) => async (_req: any, _reply: any) => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import counterpartyRoutes from './routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1' };
  });
  await app.register(counterpartyRoutes);
  return app;
}

describe('counterparty.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissionGuard.mockImplementation((_key: string) => async (_req: any, _reply: any) => {});
    mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(mocks.prisma));
  });

  describe('permission guard', () => {
    it('returns 403 when the caller lacks manageB2B', async () => {
      mocks.permissionGuard.mockImplementation((key: string) =>
        key === 'manageB2B'
          ? async (_req: any, reply: any) => reply.status(403).send({ success: false, error: 'Forbidden' })
          : async (_req: any, _reply: any) => {}
      );

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/counterparties' });

      expect(response.statusCode).toBe(403);
      expect(mocks.prisma.counterparty.findMany).not.toHaveBeenCalled();
      await app.close();
    });

    it('registers every endpoint (all 7) through permissionGuard(\'manageB2B\')', async () => {
      // permissionGuard(key) is invoked at route-registration time (it's
      // called inline in each route's options object), so building the
      // app alone is enough to prove every route is wired — no requests
      // needed.
      const app = await buildApp();
      await app.close();

      expect(mocks.permissionGuard).toHaveBeenCalledTimes(7);
      expect(mocks.permissionGuard.mock.calls.every(([key]) => key === 'manageB2B')).toBe(true);
    });
  });

  describe('GET /counterparties', () => {
    it('lists counterparties for the tenant with pagination', async () => {
      mocks.prisma.counterparty.findMany.mockResolvedValue([{ id: 'cp-1', name: 'Acme' }]);
      mocks.prisma.counterparty.count.mockResolvedValue(1);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/counterparties' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.items).toHaveLength(1);
      expect(body.data.total).toBe(1);
      expect(mocks.prisma.counterparty.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1' }, skip: 0, take: 20 })
      );
      await app.close();
    });

    it('filters by search/type/isActive', async () => {
      mocks.prisma.counterparty.findMany.mockResolvedValue([]);
      mocks.prisma.counterparty.count.mockResolvedValue(0);

      const app = await buildApp();
      await app.inject({ method: 'GET', url: '/counterparties?search=acme&type=ORGANIZATION&isActive=false' });

      expect(mocks.prisma.counterparty.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            type: 'ORGANIZATION',
            isActive: false,
            OR: expect.any(Array),
          }),
        })
      );
      await app.close();
    });
  });

  describe('POST /counterparties', () => {
    it('creates an INDIVIDUAL counterparty without taxId', async () => {
      mocks.prisma.counterparty.create.mockResolvedValue({ id: 'cp-1', type: 'INDIVIDUAL', name: 'John' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/counterparties',
        payload: { type: 'INDIVIDUAL', name: 'John' },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.counterparty.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1', type: 'INDIVIDUAL', name: 'John', supplierId: null }) })
      );
      await app.close();
    });

    it('rejects ORGANIZATION without taxId', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/counterparties',
        payload: { type: 'ORGANIZATION', name: 'Acme LLC' },
      });

      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.counterparty.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('accepts ORGANIZATION with taxId', async () => {
      mocks.prisma.counterparty.create.mockResolvedValue({ id: 'cp-2', type: 'ORGANIZATION', name: 'Acme LLC', taxId: '123456789' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/counterparties',
        payload: { type: 'ORGANIZATION', name: 'Acme LLC', taxId: '123456789' },
      });

      expect(response.statusCode).toBe(201);
      await app.close();
    });

    it('returns 404 when supplierId does not belong to the tenant', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/counterparties',
        payload: { type: 'INDIVIDUAL', name: 'John', supplierId: 'sup-foreign' },
      });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.counterparty.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 409 when supplierId is already linked to another counterparty', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1' });
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-existing' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/counterparties',
        payload: { type: 'INDIVIDUAL', name: 'John', supplierId: 'sup-1' },
      });

      expect(response.statusCode).toBe(409);
      expect(mocks.prisma.counterparty.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 409 on a P2002 race for supplierId', async () => {
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1' });
      mocks.prisma.counterparty.findFirst.mockResolvedValue(null);
      mocks.prisma.counterparty.create.mockRejectedValue({ code: 'P2002' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/counterparties',
        payload: { type: 'INDIVIDUAL', name: 'John', supplierId: 'sup-1' },
      });

      expect(response.statusCode).toBe(409);
      await app.close();
    });
  });

  describe('GET /counterparties/:id', () => {
    it('returns the counterparty including currentDebt', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1', name: 'Acme', currentDebt: '150000.00' });

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/counterparties/cp-1' });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.currentDebt).toBe('150000.00');
      await app.close();
    });

    it('returns 404 for a counterparty belonging to another tenant', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/counterparties/cp-foreign' });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.counterparty.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cp-foreign', tenantId: 'tenant-1' } })
      );
      await app.close();
    });
  });

  describe('PATCH /counterparties/:id', () => {
    it('updates fields and never accepts currentDebt', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({
        id: 'cp-1', tenantId: 'tenant-1', type: 'INDIVIDUAL', taxId: null, supplierId: null,
      });
      mocks.prisma.counterparty.update.mockResolvedValue({ id: 'cp-1', name: 'New Name' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/counterparties/cp-1',
        payload: { name: 'New Name', currentDebt: 999999 },
      });

      expect(response.statusCode).toBe(200);
      const updateCall = mocks.prisma.counterparty.update.mock.calls[0][0];
      expect(updateCall.data.currentDebt).toBeUndefined();
      expect(updateCall.data.name).toBe('New Name');
      await app.close();
    });

    it('returns 404 for a counterparty belonging to another tenant', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'PATCH', url: '/counterparties/cp-foreign', payload: { name: 'X' } });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.counterparty.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('rejects switching to ORGANIZATION without taxId (existing row has none)', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({
        id: 'cp-1', tenantId: 'tenant-1', type: 'INDIVIDUAL', taxId: null, supplierId: null,
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/counterparties/cp-1',
        payload: { type: 'ORGANIZATION' },
      });

      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.counterparty.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('allows switching to ORGANIZATION when taxId is provided in the same patch', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({
        id: 'cp-1', tenantId: 'tenant-1', type: 'INDIVIDUAL', taxId: null, supplierId: null,
      });
      mocks.prisma.counterparty.update.mockResolvedValue({ id: 'cp-1', type: 'ORGANIZATION', taxId: '123' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/counterparties/cp-1',
        payload: { type: 'ORGANIZATION', taxId: '123' },
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('returns 409 when re-linking supplierId to one already in use', async () => {
      mocks.prisma.counterparty.findFirst
        .mockResolvedValueOnce({ id: 'cp-1', tenantId: 'tenant-1', type: 'INDIVIDUAL', taxId: null, supplierId: null })
        .mockResolvedValueOnce({ id: 'cp-other' });
      mocks.prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1' });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/counterparties/cp-1',
        payload: { supplierId: 'sup-1' },
      });

      expect(response.statusCode).toBe(409);
      expect(mocks.prisma.counterparty.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('allows unlinking supplierId via explicit null', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({
        id: 'cp-1', tenantId: 'tenant-1', type: 'INDIVIDUAL', taxId: null, supplierId: 'sup-1',
      });
      mocks.prisma.counterparty.update.mockResolvedValue({ id: 'cp-1', supplierId: null });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: '/counterparties/cp-1',
        payload: { supplierId: null },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.supplier.findFirst).not.toHaveBeenCalled();
      expect(mocks.prisma.counterparty.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ supplierId: null }) })
      );
      await app.close();
    });
  });

  describe('GET /counterparties/:id/prices', () => {
    it('lists prices with product/variant joined in', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1' });
      mocks.prisma.counterpartyPrice.findMany.mockResolvedValue([
        { id: 'price-1', price: '90000', product: { id: 'prod-1', name: 'Widget' }, variant: null },
      ]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/counterparties/cp-1/prices' });

      expect(response.statusCode).toBe(200);
      expect(response.json().data[0].product.name).toBe('Widget');
      await app.close();
    });

    it('returns 404 for a counterparty belonging to another tenant', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/counterparties/cp-foreign/prices' });

      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });

  describe('PUT /counterparties/:id/prices', () => {
    it('creates a new price when none exists for (productId, variantId=null)', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1' });
      mocks.prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
      mocks.prisma.counterpartyPrice.findFirst.mockResolvedValue(null);
      mocks.prisma.counterpartyPrice.create.mockResolvedValue({ id: 'price-1', price: 90000 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/counterparties/cp-1/prices',
        payload: { productId: 'prod-1', price: 90000 },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.counterpartyPrice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { counterpartyId: 'cp-1', productId: 'prod-1', variantId: null } })
      );
      expect(mocks.prisma.counterpartyPrice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { counterpartyId: 'cp-1', productId: 'prod-1', variantId: null, price: 90000 } })
      );
      expect(mocks.prisma.counterpartyPrice.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('updates the existing price for the same (productId, variantId) tuple', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1' });
      mocks.prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
      mocks.prisma.counterpartyPrice.findFirst.mockResolvedValue({ id: 'price-1' });
      mocks.prisma.counterpartyPrice.update.mockResolvedValue({ id: 'price-1', price: 95000 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/counterparties/cp-1/prices',
        payload: { productId: 'prod-1', price: 95000 },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.counterpartyPrice.update).toHaveBeenCalledWith({ where: { id: 'price-1' }, data: { price: 95000 } });
      expect(mocks.prisma.counterpartyPrice.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('validates the variant belongs to the given product', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1' });
      mocks.prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
      mocks.prisma.productVariant.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/counterparties/cp-1/prices',
        payload: { productId: 'prod-1', variantId: 'var-foreign', price: 90000 },
      });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.counterpartyPrice.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 when productId does not belong to the tenant', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1' });
      mocks.prisma.product.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/counterparties/cp-1/prices',
        payload: { productId: 'prod-foreign', price: 90000 },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('recovers from a P2002 race by retrying as an update', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1' });
      mocks.prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
      mocks.prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
      mocks.prisma.counterpartyPrice.findFirst.mockResolvedValue({ id: 'price-1' });
      mocks.prisma.counterpartyPrice.update.mockResolvedValue({ id: 'price-1', price: 90000 });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/counterparties/cp-1/prices',
        payload: { productId: 'prod-1', price: 90000 },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.counterpartyPrice.update).toHaveBeenCalledWith({ where: { id: 'price-1' }, data: { price: 90000 } });
      await app.close();
    });
  });

  describe('DELETE /counterparties/:id/prices/:priceId', () => {
    it('deletes the price', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1' });
      mocks.prisma.counterpartyPrice.deleteMany.mockResolvedValue({ count: 1 });

      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/counterparties/cp-1/prices/price-1' });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.counterpartyPrice.deleteMany).toHaveBeenCalledWith({ where: { id: 'price-1', counterpartyId: 'cp-1' } });
      await app.close();
    });

    it('returns 404 when the price does not exist for this counterparty', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-1' });
      mocks.prisma.counterpartyPrice.deleteMany.mockResolvedValue({ count: 0 });

      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/counterparties/cp-1/prices/price-foreign' });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('returns 404 for a counterparty belonging to another tenant', async () => {
      mocks.prisma.counterparty.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({ method: 'DELETE', url: '/counterparties/cp-foreign/prices/price-1' });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.counterpartyPrice.deleteMany).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
