import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    store: { findFirst: vi.fn() },
    posDevice: { create: vi.fn() },
    deviceActivation: { create: vi.fn() },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    category: { findMany: vi.fn().mockResolvedValue([]) },
    productType: { findMany: vi.fn().mockResolvedValue([]) },
    catalogSnapshot: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    posSettings: { upsert: vi.fn() },
    posOperator: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    shiftEvent: { findMany: vi.fn(), count: vi.fn() },
    fiscalEvent: { findMany: vi.fn() },
  },
  planGuard: vi.fn((_key: string) => async () => {}),
  permissionGuard: vi.fn((_key: string) => async () => {}),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));

import posDeviceAdminRoutes from './admin-routes.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.addHook('preHandler', async (request) => {
    (request as any).tenantId = 'tenant-1';
    (request as any).user = { userId: 'user-1' };
  });
  await app.register(posDeviceAdminRoutes);
  return app;
}

describe('pos-sync.admin-routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.product.findMany.mockResolvedValue([]);
    mocks.prisma.category.findMany.mockResolvedValue([]);
    mocks.prisma.productType.findMany.mockResolvedValue([]);
    mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue(null);
  });

  describe('POST /pos-devices', () => {
    it('creates a device and a one-time activation code', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.posDevice.create.mockResolvedValue({
        id: 'dev-1', name: 'Front till', deviceType: 'till', status: 'PENDING', storeId: 'store-1', createdAt: new Date(),
      });
      mocks.prisma.deviceActivation.create.mockResolvedValue({
        activationCode: 'ABCD-1234', expiresAt: new Date(Date.now() + 900_000),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices',
        payload: { storeId: 'store-1', name: 'Front till' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.device.id).toBe('dev-1');
      expect(body.data.activationCode).toBe('ABCD-1234');
      expect(mocks.prisma.posDevice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1', storeId: 'store-1', name: 'Front till' }) })
      );
      await app.close();
    });

    it('returns 404 when the store does not belong to the tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices',
        payload: { storeId: 'store-foreign', name: 'Front till' },
      });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.posDevice.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when name is missing', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices',
        payload: { storeId: 'store-1' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /pos-devices/catalog-snapshot', () => {
    it('builds and stores a snapshot at version 1 when none exists yet', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', name: 'Widget', sku: 'W1', price: 10000, currency: 'UZS', stockQty: 5, categoryId: null, variants: [] },
      ]);
      mocks.prisma.category.findMany.mockResolvedValue([
        { id: 'c-1', name: 'Widgets', slug: 'widgets', sortOrder: 0, parentId: null },
      ]);
      mocks.prisma.catalogSnapshot.create.mockResolvedValue({ id: 'snap-1', version: 1, createdAt: new Date() });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices/catalog-snapshot',
        payload: { storeId: 'store-1' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.version).toBe(1);
      expect(mocks.prisma.catalogSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            storeId: 'store-1',
            version: 1,
            payload: {
              categories: [expect.objectContaining({ id: 'c-1', name: 'Widgets' })],
              products: [expect.objectContaining({ id: 'p-1', name: 'Widget' })],
              barcodes: [],
              uzProfiles: [],
            },
          }),
        })
      );
      await app.close();
    });

    it('increments the version when a previous snapshot exists', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.catalogSnapshot.findFirst.mockResolvedValue({ version: 2 });
      mocks.prisma.catalogSnapshot.create.mockResolvedValue({ id: 'snap-3', version: 3, createdAt: new Date() });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices/catalog-snapshot',
        payload: { storeId: 'store-1' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.version).toBe(3);
      await app.close();
    });

    it('returns 404 when the store does not belong to the tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices/catalog-snapshot',
        payload: { storeId: 'store-foreign' },
      });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.catalogSnapshot.create).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('PUT /pos-devices/settings', () => {
    const validSettings = {
      taxProfile: { vat: 12 },
      paymentMethods: [{ code: 'cash' }],
      receiptTemplate: {},
      printerProfile: {},
      fiscalProfile: {},
      offlineLimits: { maxOfflineHours: 24 },
      roundingRules: {},
      featureFlags: {},
    };

    it('upserts the store settings document and returns the version', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.posSettings.upsert.mockResolvedValue({
        storeId: 'store-1', version: 2, updatedAt: new Date(),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/pos-devices/settings',
        payload: { storeId: 'store-1', settings: validSettings },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.version).toBe(2);
      expect(mocks.prisma.posSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId: 'store-1' },
          create: expect.objectContaining({ tenantId: 'tenant-1', storeId: 'store-1', version: 1, payload: validSettings }),
          update: expect.objectContaining({ version: { increment: 1 }, payload: validSettings }),
        })
      );
      await app.close();
    });

    it('returns 400 when a settings key is missing', async () => {
      const { featureFlags: _omit, ...incomplete } = validSettings;

      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/pos-devices/settings',
        payload: { storeId: 'store-1', settings: incomplete },
      });

      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.posSettings.upsert).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 when the store does not belong to the tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/pos-devices/settings',
        payload: { storeId: 'store-foreign', settings: validSettings },
      });

      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.posSettings.upsert).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('POS operators (docs/POS_POLICY_ENGINE.md §14)', () => {
    describe('GET /pos-operators', () => {
      it('lists operators for a store owned by the tenant', async () => {
        mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
        mocks.prisma.posOperator.findMany.mockResolvedValue([
          { id: 'op-1', name: 'Alice', role: 'CASHIER', permissions: [], active: true },
        ]);

        const app = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/pos-operators?storeId=store-1' });

        expect(response.statusCode).toBe(200);
        expect(response.json().data).toHaveLength(1);
        expect(mocks.prisma.posOperator.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { tenantId: 'tenant-1', storeId: 'store-1' }, orderBy: { name: 'asc' } })
        );
        await app.close();
      });

      it('returns 404 when the store does not belong to the tenant', async () => {
        mocks.prisma.store.findFirst.mockResolvedValue(null);

        const app = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/pos-operators?storeId=store-foreign' });

        expect(response.statusCode).toBe(404);
        expect(mocks.prisma.posOperator.findMany).not.toHaveBeenCalled();
        await app.close();
      });
    });

    describe('POST /pos-operators', () => {
      it('creates an operator with explicit permissions verbatim, not the role default', async () => {
        mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
        mocks.prisma.posOperator.create.mockResolvedValue({
          id: 'op-1', tenantId: 'tenant-1', storeId: 'store-1', name: 'Alice', role: 'CASHIER', permissions: [], active: true,
        });
        mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', staffVersion: 2 });

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/pos-operators',
          payload: { storeId: 'store-1', name: 'Alice', role: 'CASHIER', permissions: ['void_sale'] },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json().data.id).toBe('op-1');
        expect(mocks.prisma.posOperator.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              tenantId: 'tenant-1', storeId: 'store-1', name: 'Alice', role: 'CASHIER', permissions: ['void_sale'], active: true,
            }),
          })
        );
        expect(mocks.prisma.posSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { storeId: 'store-1' },
            update: { staffVersion: { increment: 1 } },
            create: expect.objectContaining({ tenantId: 'tenant-1', storeId: 'store-1' }),
          })
        );
        await app.close();
      });

      // docs/POS_POLICY_ENGINE.md §14.6.
      it('defaults permissions to DEFAULT_PERMISSIONS[role] when permissions is omitted', async () => {
        mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
        mocks.prisma.posOperator.create.mockResolvedValue({ id: 'op-2' });

        const app = await buildApp();
        await app.inject({
          method: 'POST',
          url: '/pos-operators',
          payload: { storeId: 'store-1', name: 'Bob', role: 'SENIOR_CASHIER' },
        });

        expect(mocks.prisma.posOperator.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              role: 'SENIOR_CASHIER',
              permissions: expect.arrayContaining([
                'SHIFT_OPEN', 'SHIFT_CLOSE', 'REFUND_APPROVE', 'CASH_IN', 'CASH_OUT',
              ]),
            }),
          })
        );
        // SENIOR_CASHIER must not pick up ADMIN-only permissions.
        const created = mocks.prisma.posOperator.create.mock.calls[0][0].data.permissions;
        expect(created).not.toContain('POS_SETTINGS_EDIT');
        expect(created).not.toContain('DEV_DIAGNOSTICS');
        await app.close();
      });

      it('defaults permissions to DEFAULT_PERMISSIONS[role] when permissions is an explicit empty array', async () => {
        mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
        mocks.prisma.posOperator.create.mockResolvedValue({ id: 'op-3' });

        const app = await buildApp();
        await app.inject({
          method: 'POST',
          url: '/pos-operators',
          payload: { storeId: 'store-1', name: 'Cher', role: 'ADMIN', permissions: [] },
        });

        const created = mocks.prisma.posOperator.create.mock.calls[0][0].data.permissions;
        expect(created).toContain('DEV_DIAGNOSTICS');
        expect(created).toContain('SHIFT_OPEN');
        await app.close();
      });

      it('returns 404 when the store does not belong to the tenant', async () => {
        mocks.prisma.store.findFirst.mockResolvedValue(null);

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/pos-operators',
          payload: { storeId: 'store-foreign', name: 'Alice', role: 'CASHIER' },
        });

        expect(response.statusCode).toBe(404);
        expect(mocks.prisma.posOperator.create).not.toHaveBeenCalled();
        await app.close();
      });

      it('returns 400 for an invalid role', async () => {
        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/pos-operators',
          payload: { storeId: 'store-1', name: 'Alice', role: 'SUPERVISOR' },
        });

        expect(response.statusCode).toBe(400);
        expect(mocks.prisma.posOperator.create).not.toHaveBeenCalled();
        await app.close();
      });
    });

    describe('PATCH /pos-operators/:id', () => {
      it('updates non-role/permissions fields and bumps staffVersion, leaving permissions untouched', async () => {
        mocks.prisma.posOperator.findFirst.mockResolvedValue({ id: 'op-1', storeId: 'store-1' });
        mocks.prisma.posOperator.update.mockResolvedValue({
          id: 'op-1', name: 'Alice B.', role: 'CASHIER', permissions: [], active: true,
        });
        mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', staffVersion: 3 });

        const app = await buildApp();
        const response = await app.inject({
          method: 'PATCH',
          url: '/pos-operators/op-1',
          payload: { name: 'Alice B.' },
        });

        expect(response.statusCode).toBe(200);
        expect(mocks.prisma.posOperator.update).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'op-1' }, data: { name: 'Alice B.' } })
        );
        expect(mocks.prisma.posSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ where: { storeId: 'store-1' }, update: { staffVersion: { increment: 1 } } })
        );
        await app.close();
      });

      // docs/POS_POLICY_ENGINE.md §14.6.
      it('re-derives permissions from DEFAULT_PERMISSIONS[newRole] when role changes with no explicit permissions', async () => {
        mocks.prisma.posOperator.findFirst.mockResolvedValue({ id: 'op-1', storeId: 'store-1' });
        mocks.prisma.posOperator.update.mockResolvedValue({ id: 'op-1' });
        mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', staffVersion: 3 });

        const app = await buildApp();
        await app.inject({
          method: 'PATCH',
          url: '/pos-operators/op-1',
          payload: { name: 'Alice B.', role: 'SENIOR_CASHIER' },
        });

        const data = mocks.prisma.posOperator.update.mock.calls[0][0].data;
        expect(data.role).toBe('SENIOR_CASHIER');
        expect(data.permissions).toContain('SHIFT_CLOSE');
        expect(data.permissions).toContain('CASH_IN');
        expect(data.permissions).not.toContain('POS_SETTINGS_EDIT');
        await app.close();
      });

      it('does not override an explicitly provided permissions[] even when role also changes', async () => {
        mocks.prisma.posOperator.findFirst.mockResolvedValue({ id: 'op-1', storeId: 'store-1' });
        mocks.prisma.posOperator.update.mockResolvedValue({ id: 'op-1' });
        mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', staffVersion: 3 });

        const app = await buildApp();
        await app.inject({
          method: 'PATCH',
          url: '/pos-operators/op-1',
          payload: { role: 'ADMIN', permissions: ['CUSTOM_ONLY'] },
        });

        expect(mocks.prisma.posOperator.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { role: 'ADMIN', permissions: ['CUSTOM_ONLY'] } })
        );
        await app.close();
      });

      it('returns 404 (tenant isolation) for an operator belonging to another tenant', async () => {
        mocks.prisma.posOperator.findFirst.mockResolvedValue(null);

        const app = await buildApp();
        const response = await app.inject({
          method: 'PATCH',
          url: '/pos-operators/op-foreign',
          payload: { active: false },
        });

        expect(response.statusCode).toBe(404);
        expect(mocks.prisma.posOperator.update).not.toHaveBeenCalled();
        expect(mocks.prisma.posSettings.upsert).not.toHaveBeenCalled();
        await app.close();
      });
    });

    describe('DELETE /pos-operators/:id', () => {
      it('deletes an operator belonging to the tenant and bumps staffVersion', async () => {
        mocks.prisma.posOperator.findFirst.mockResolvedValue({ id: 'op-1', storeId: 'store-1' });
        mocks.prisma.posOperator.delete.mockResolvedValue({ id: 'op-1' });
        mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', staffVersion: 4 });

        const app = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/pos-operators/op-1' });

        expect(response.statusCode).toBe(200);
        expect(mocks.prisma.posOperator.delete).toHaveBeenCalledWith({ where: { id: 'op-1' } });
        expect(mocks.prisma.posSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ where: { storeId: 'store-1' }, update: { staffVersion: { increment: 1 } } })
        );
        await app.close();
      });

      it('returns 404 (tenant isolation) for an operator belonging to another tenant', async () => {
        mocks.prisma.posOperator.findFirst.mockResolvedValue(null);

        const app = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/pos-operators/op-foreign' });

        expect(response.statusCode).toBe(404);
        expect(mocks.prisma.posOperator.delete).not.toHaveBeenCalled();
        expect(mocks.prisma.posSettings.upsert).not.toHaveBeenCalled();
        await app.close();
      });
    });
  });

  describe('GET /pos-shifts', () => {
    it('lists closed shifts ordered by closedAtMs desc', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.shiftEvent.findMany.mockResolvedValue([
        { id: 'sh-2', shiftNumber: 2, openedAtMs: new Date(), closedAtMs: new Date(), zReportStatus: 'OK', deviceId: 'dev-1', device: { name: 'Front till' } },
        { id: 'sh-1', shiftNumber: 1, openedAtMs: new Date(), closedAtMs: new Date(), zReportStatus: 'FAILED', deviceId: 'dev-1', device: { name: 'Front till' } },
      ]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-shifts?storeId=store-1' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.items).toHaveLength(2);
      expect(body.data.nextCursor).toBeNull();
      expect(mocks.prisma.shiftEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', storeId: 'store-1', eventType: 'SHIFT_CLOSED' }),
          orderBy: { closedAtMs: 'desc' },
          take: 25,
        })
      );
      await app.close();
    });

    it('filters by deviceId when provided', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.shiftEvent.findMany.mockResolvedValue([]);

      const app = await buildApp();
      await app.inject({ method: 'GET', url: '/pos-shifts?storeId=store-1&deviceId=dev-1' });

      expect(mocks.prisma.shiftEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deviceId: 'dev-1' }) })
      );
      await app.close();
    });

    it('paginates via cursor and returns nextCursor when a full page comes back', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.shiftEvent.findMany.mockResolvedValue(
        Array.from({ length: 2 }, (_, i) => ({
          id: `sh-${i}`, shiftNumber: i, openedAtMs: new Date(), closedAtMs: new Date(), zReportStatus: 'OK', deviceId: 'dev-1', device: { name: 'Till' },
        }))
      );

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-shifts?storeId=store-1&limit=2&cursor=sh-prev' });

      expect(response.json().data.nextCursor).toBe('sh-1');
      expect(mocks.prisma.shiftEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'sh-prev' }, skip: 1, take: 2 })
      );
      await app.close();
    });

    it('returns 404 for a store belonging to another tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-shifts?storeId=store-foreign' });
      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.shiftEvent.findMany).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when storeId is missing', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-shifts' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('GET /pos-receipts', () => {
    it('lists fiscalized receipts ordered by createdAtMs desc', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.fiscalEvent.findMany.mockResolvedValue([
        { id: 'r-1', localReceiptId: 'l-1', receiptNumber: '1', receiptType: 'SALE', totalAmount: 15000, currency: 'UZS', payments: [], items: [], fiscalStatus: 'SUCCESS', fiscalQr: 'qr', fiscalSign: 'sign', createdAtMs: new Date(), shiftNumber: 1, deviceId: 'dev-1', device: { name: 'Front till' } },
      ]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-receipts?storeId=store-1' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.items).toHaveLength(1);
      expect(mocks.prisma.fiscalEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', storeId: 'store-1', eventType: 'FISCAL_SUCCESS' }),
          orderBy: { createdAtMs: 'desc' },
          take: 25,
        })
      );
      await app.close();
    });

    it('filters by shiftNumber when provided', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.fiscalEvent.findMany.mockResolvedValue([]);

      const app = await buildApp();
      await app.inject({ method: 'GET', url: '/pos-receipts?storeId=store-1&shiftNumber=3' });

      expect(mocks.prisma.fiscalEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ shiftNumber: 3 }) })
      );
      await app.close();
    });

    it('filters by deviceId when provided', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.fiscalEvent.findMany.mockResolvedValue([]);

      const app = await buildApp();
      await app.inject({ method: 'GET', url: '/pos-receipts?storeId=store-1&deviceId=dev-2' });

      expect(mocks.prisma.fiscalEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deviceId: 'dev-2' }) })
      );
      await app.close();
    });

    it('returns 404 for a store belonging to another tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-receipts?storeId=store-foreign' });
      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.fiscalEvent.findMany).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('GET /pos-analytics', () => {
    it('aggregates shifts, receipts, byDay, byPayment and topProducts', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.shiftEvent.count.mockResolvedValue(3);
      mocks.prisma.shiftEvent.findMany.mockResolvedValue([
        { openedAtMs: new Date('2026-07-01T08:00:00Z'), closedAtMs: new Date('2026-07-01T16:00:00Z') },
        { openedAtMs: new Date('2026-07-01T08:00:00Z'), closedAtMs: new Date('2026-07-01T12:00:00Z') },
      ]);
      mocks.prisma.fiscalEvent.findMany.mockResolvedValue([
        {
          receiptType: 'SALE', totalAmount: 10000, createdAtMs: new Date('2026-07-01T10:00:00Z'),
          payments: [{ type: 'CASH', sum: 10000 }],
          items: [{ name: 'Coffee', qty: 2, sum: 10000 }],
        },
        {
          receiptType: 'REFUND', totalAmount: 5000, createdAtMs: new Date('2026-07-01T11:00:00Z'),
          payments: [{ method: 'CARD', amount: 5000 }],
          items: [{ title: 'Coffee', quantity: 1, total: 5000 }],
        },
      ]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-analytics?storeId=store-1&period=today' });

      expect(response.statusCode).toBe(200);
      const { data } = response.json();
      expect(data.shifts).toEqual({ total: 3, completed: 2, avgDuration: 360 });
      expect(data.receipts).toEqual({ total: 2, sales: 1, refunds: 1, totalAmount: 15000, avgAmount: 7500 });
      expect(data.byPayment).toEqual(
        expect.arrayContaining([
          { method: 'CASH', amount: 10000, count: 1 },
          { method: 'CARD', amount: 5000, count: 1 },
        ])
      );
      expect(data.topProducts).toEqual([{ name: 'Coffee', qty: 3, amount: 15000 }]);
      expect(Array.isArray(data.byDay)).toBe(true);
      expect(data.byDay.length).toBeGreaterThan(0);
      await app.close();
    });

    it('returns 400 for an invalid period', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-analytics?storeId=store-1&period=decade' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('returns 400 for period=custom without from/to', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-analytics?storeId=store-1&period=custom' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('accepts period=custom with a from/to range', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.shiftEvent.count.mockResolvedValue(0);
      mocks.prisma.shiftEvent.findMany.mockResolvedValue([]);
      mocks.prisma.fiscalEvent.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/pos-analytics?storeId=store-1&period=custom&from=2026-06-01&to=2026-06-30',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.receipts.total).toBe(0);
      await app.close();
    });

    it('returns 404 for a store belonging to another tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-analytics?storeId=store-foreign' });
      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.fiscalEvent.findMany).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
