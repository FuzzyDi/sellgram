import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {},
  service: {
    archiveStorePaymentMethod: vi.fn(),
    createStorePaymentMethod: vi.fn(),
    ensureStoreForTenant: vi.fn(),
    listStorePaymentMethods: vi.fn(),
    updateStorePaymentMethod: vi.fn(),
  },
  permissionGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({
  default: mocks.prisma,
}));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

vi.mock('./payment-methods.service.js', () => ({
  archiveStorePaymentMethod: mocks.service.archiveStorePaymentMethod,
  createStorePaymentMethod: mocks.service.createStorePaymentMethod,
  ensureStoreForTenant: mocks.service.ensureStoreForTenant,
  listStorePaymentMethods: mocks.service.listStorePaymentMethods,
  updateStorePaymentMethod: mocks.service.updateStorePaymentMethod,
}));

import paymentMethodRoutes from './payment-methods.routes.js';

async function buildApp() {
  const app = Fastify();

  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
  });

  await app.register(paymentMethodRoutes);
  return app;
}

describe('payment-methods.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when store is not found', async () => {
    mocks.service.ensureStoreForTenant.mockRejectedValue(new Error('STORE_NOT_FOUND'));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/stores/store-404/payment-methods',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'Store not found' });
    expect(mocks.service.listStorePaymentMethods).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns store payment methods list', async () => {
    mocks.service.ensureStoreForTenant.mockResolvedValue({ id: 'store-1' });
    mocks.service.listStorePaymentMethods.mockResolvedValue([{ id: 'pm-1' }]);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/stores/store-1/payment-methods',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: [{ id: 'pm-1' }] });
    expect(mocks.service.listStorePaymentMethods).toHaveBeenCalledWith(mocks.prisma, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
    });

    await app.close();
  });

  it('maps PAYMENT_METHOD_NOT_FOUND to 404 on update', async () => {
    mocks.service.updateStorePaymentMethod.mockRejectedValue(new Error('PAYMENT_METHOD_NOT_FOUND'));

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/stores/store-1/payment-methods/pm-404',
      payload: { title: 'New title' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'Payment method not found' });

    await app.close();
  });

  it('archives payment method', async () => {
    mocks.service.archiveStorePaymentMethod.mockResolvedValue(undefined);

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/stores/store-1/payment-methods/pm-1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, message: 'Payment method archived' });
    expect(mocks.service.archiveStorePaymentMethod).toHaveBeenCalledWith(mocks.prisma, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
      methodId: 'pm-1',
    });

    await app.close();
  });
});
