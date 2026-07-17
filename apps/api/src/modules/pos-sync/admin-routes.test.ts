import Fastify from 'fastify';
import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    store: { findFirst: vi.fn() },
    posDevice: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
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
    paymentTerminal: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    cloudCommand: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(),
    },
    posPaymentEvent: { findMany: vi.fn().mockResolvedValue([]) },
    posDeviceSettings: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
  },
  planGuard: vi.fn((_key: string) => async () => {}),
  permissionGuard: vi.fn((_key: string) => async () => {}),
  // docs/POS_SETTINGS_ARCHITECTURE.md §5 — same mocking convention as
  // src/modules/store/service.test.ts uses for botToken encryption:
  // real AES-256-GCM output has a random IV, so exact-value assertions
  // on encryptSecrets' output need a deterministic stand-in.
  encrypt: vi.fn((value: string) => `encrypted(${value})`),
  decrypt: vi.fn((value: string) => `decrypted(${value})`),
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));
vi.mock('../../plugins/plan-guard.js', () => ({ planGuard: mocks.planGuard }));
vi.mock('../../plugins/permission-guard.js', () => ({ permissionGuard: mocks.permissionGuard }));
vi.mock('../../lib/encrypt.js', () => ({ encrypt: mocks.encrypt, decrypt: mocks.decrypt }));

// A value shaped like apps/api/src/lib/encrypt.ts's real output
// (iv:encrypted:tag, iv/tag each 32 hex chars) so encryptSecrets'
// isEncryptedValue() check recognizes it as already-encrypted and
// leaves it alone — used to stand in for a stored secret from a prior
// (real) encryption, as opposed to legacy/never-encrypted plaintext.
const FAKE_CIPHERTEXT = `${'a'.repeat(32)}:deadbeef:${'b'.repeat(32)}`;

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

    // docs/POS_SYNC_API.md §15 — fanOutCommandToActiveDevices.
    it('creates a REFRESH_CATALOG command for active devices without an existing PENDING one, skips the rest', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.catalogSnapshot.create.mockResolvedValue({ id: 'snap-1', version: 5, createdAt: new Date() });
      mocks.prisma.posDevice.findMany.mockResolvedValue([
        { id: 'dev-1' }, { id: 'dev-2' }, { id: 'dev-3' },
      ]);
      // dev-2 already has a PENDING REFRESH_CATALOG — must not get a second one.
      mocks.prisma.cloudCommand.findMany.mockResolvedValue([{ deviceId: 'dev-2' }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices/catalog-snapshot',
        payload: { storeId: 'store-1' },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.posDevice.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', storeId: 'store-1', status: 'ACTIVE' },
        select: { id: true },
      });
      expect(mocks.prisma.cloudCommand.createMany).toHaveBeenCalledWith({
        data: [
          { tenantId: 'tenant-1', deviceId: 'dev-1', type: 'REFRESH_CATALOG', payload: { catalogVersion: 5 }, status: 'PENDING' },
          { tenantId: 'tenant-1', deviceId: 'dev-3', type: 'REFRESH_CATALOG', payload: { catalogVersion: 5 }, status: 'PENDING' },
        ],
      });
      await app.close();
    });

    it('skips the CloudCommand fan-out entirely when the store has no active devices', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.catalogSnapshot.create.mockResolvedValue({ id: 'snap-1', version: 1, createdAt: new Date() });
      mocks.prisma.posDevice.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices/catalog-snapshot',
        payload: { storeId: 'store-1' },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.cloudCommand.createMany).not.toHaveBeenCalled();
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

    it('creates a REFRESH_SETTINGS command for active devices without an existing PENDING one', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', version: 4, updatedAt: new Date() });
      mocks.prisma.posDevice.findMany.mockResolvedValue([{ id: 'dev-1' }]);
      mocks.prisma.cloudCommand.findMany.mockResolvedValue([]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/pos-devices/settings',
        payload: { storeId: 'store-1', settings: validSettings },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.cloudCommand.createMany).toHaveBeenCalledWith({
        data: [{ tenantId: 'tenant-1', deviceId: 'dev-1', type: 'REFRESH_SETTINGS', payload: { settingsVersion: 4 }, status: 'PENDING' }],
      });
      await app.close();
    });
  });

  describe('GET /pos-devices', () => {
    it('includes pendingCommandsCount per device, batched (not one query per device)', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.posDevice.findMany.mockResolvedValue([
        { id: 'dev-1', name: 'Till 1', deviceType: 'till', status: 'ACTIVE', deviceCode: 'code-1', lastSeenAt: null, createdAt: new Date() },
        { id: 'dev-2', name: 'Till 2', deviceType: 'till', status: 'ACTIVE', deviceCode: 'code-2', lastSeenAt: null, createdAt: new Date() },
      ]);
      mocks.prisma.cloudCommand.groupBy.mockResolvedValue([
        { deviceId: 'dev-1', _count: { id: 3 } },
      ]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-devices?storeId=store-1' });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.cloudCommand.groupBy).toHaveBeenCalledWith({
        by: ['deviceId'],
        where: { deviceId: { in: ['dev-1', 'dev-2'] }, status: 'PENDING' },
        _count: { id: true },
      });
      const [dev1, dev2] = response.json().data;
      expect(dev1.pendingCommandsCount).toBe(3);
      // dev-2 has no groupBy row at all — must default to 0, not undefined.
      expect(dev2.pendingCommandsCount).toBe(0);
      await app.close();
    });

    it('returns 404 for a store belonging to another tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-devices?storeId=store-foreign' });
      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });

  describe('POST /pos-devices/commands (docs/POS_SYNC_API.md §15 — manual send)', () => {
    it('creates a PENDING command for a device belonging to this tenant', async () => {
      mocks.prisma.posDevice.findFirst.mockResolvedValue({ id: 'dev-1' });
      mocks.prisma.cloudCommand.create.mockResolvedValue({
        id: 'cmd-1', deviceId: 'dev-1', type: 'PING', payload: {}, status: 'PENDING', createdAt: new Date(),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices/commands',
        payload: { deviceId: 'dev-1', type: 'PING' },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.cloudCommand.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1', deviceId: 'dev-1', type: 'PING', payload: {}, status: 'PENDING' }),
        })
      );
      await app.close();
    });

    it('accepts an optional payload for SHOW_MESSAGE', async () => {
      mocks.prisma.posDevice.findFirst.mockResolvedValue({ id: 'dev-1' });
      mocks.prisma.cloudCommand.create.mockResolvedValue({
        id: 'cmd-1', deviceId: 'dev-1', type: 'SHOW_MESSAGE', payload: { text: 'Hi' }, status: 'PENDING', createdAt: new Date(),
      });

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices/commands',
        payload: { deviceId: 'dev-1', type: 'SHOW_MESSAGE', payload: { text: 'Hi' } },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.prisma.cloudCommand.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payload: { text: 'Hi' } }) })
      );
      await app.close();
    });

    it('returns 400 for an unrecognized type', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices/commands',
        payload: { deviceId: 'dev-1', type: 'REBOOT' },
      });
      expect(response.statusCode).toBe(400);
      expect(mocks.prisma.cloudCommand.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 404 for a device belonging to another tenant', async () => {
      mocks.prisma.posDevice.findFirst.mockResolvedValue(null);
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/pos-devices/commands',
        payload: { deviceId: 'dev-foreign', type: 'PING' },
      });
      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.cloudCommand.create).not.toHaveBeenCalled();
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

      // docs/POS_POLICY_ENGINE.md §14.1.
      it('selects pinRequired but never pinHashSha256/pinSalt', async () => {
        mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
        mocks.prisma.posOperator.findMany.mockResolvedValue([]);

        const app = await buildApp();
        await app.inject({ method: 'GET', url: '/pos-operators?storeId=store-1' });

        const select = mocks.prisma.posOperator.findMany.mock.calls[0][0].select;
        expect(select.pinRequired).toBe(true);
        expect(select).not.toHaveProperty('pinHashSha256');
        expect(select).not.toHaveProperty('pinSalt');
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

      // docs/POS_POLICY_ENGINE.md §14.1.
      describe('PIN', () => {
        it('hashes a provided pin, forces pinRequired: true, and never returns pin/hash/salt', async () => {
          mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
          mocks.prisma.posOperator.create.mockResolvedValue({ id: 'op-1' });

          const app = await buildApp();
          const response = await app.inject({
            method: 'POST',
            url: '/pos-operators',
            payload: { storeId: 'store-1', name: 'Alice', role: 'CASHIER', pin: '1234' },
          });

          expect(response.statusCode).toBe(201);
          const call = mocks.prisma.posOperator.create.mock.calls[0][0];
          expect(call.data.pinRequired).toBe(true);
          expect(call.data.pin).toBeUndefined();
          expect(call.data.pinSalt).toMatch(/^[0-9a-f]{32}$/);
          expect(call.data.pinHashSha256).toMatch(/^[0-9a-f]{64}$/);
          // The hash is a real SHA-256 of salt+pin, not a placeholder.
          const expectedHash = createHash('sha256').update(call.data.pinSalt + '1234').digest('hex');
          expect(call.data.pinHashSha256).toBe(expectedHash);
          // select never exposes the hash/salt back to the caller.
          expect(call.select).not.toHaveProperty('pinHashSha256');
          expect(call.select).not.toHaveProperty('pinSalt');
          await app.close();
        });

        it('sets pinRequired alone (no hash/salt) when pinRequired is given without a pin', async () => {
          mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
          mocks.prisma.posOperator.create.mockResolvedValue({ id: 'op-1' });

          const app = await buildApp();
          await app.inject({
            method: 'POST',
            url: '/pos-operators',
            payload: { storeId: 'store-1', name: 'Alice', role: 'CASHIER', pinRequired: true },
          });

          const data = mocks.prisma.posOperator.create.mock.calls[0][0].data;
          expect(data.pinRequired).toBe(true);
          expect(data).not.toHaveProperty('pinHashSha256');
          expect(data).not.toHaveProperty('pinSalt');
          await app.close();
        });

        it('creates with no PIN fields at all when neither pin nor pinRequired is given', async () => {
          mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
          mocks.prisma.posOperator.create.mockResolvedValue({ id: 'op-1' });

          const app = await buildApp();
          await app.inject({
            method: 'POST',
            url: '/pos-operators',
            payload: { storeId: 'store-1', name: 'Alice', role: 'CASHIER' },
          });

          const data = mocks.prisma.posOperator.create.mock.calls[0][0].data;
          expect(data).not.toHaveProperty('pinRequired');
          expect(data).not.toHaveProperty('pinHashSha256');
          expect(data).not.toHaveProperty('pinSalt');
          await app.close();
        });

        it.each(['123', '1234567', 'abcd', ''])('rejects an invalid PIN %j with 400', async (pin) => {
          const app = await buildApp();
          const response = await app.inject({
            method: 'POST',
            url: '/pos-operators',
            payload: { storeId: 'store-1', name: 'Alice', role: 'CASHIER', pin },
          });
          expect(response.statusCode).toBe(400);
          expect(mocks.prisma.posOperator.create).not.toHaveBeenCalled();
          await app.close();
        });
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

      // docs/POS_POLICY_ENGINE.md §14.1.
      describe('PIN', () => {
        it('hashes a new pin and forces pinRequired: true', async () => {
          mocks.prisma.posOperator.findFirst.mockResolvedValue({ id: 'op-1', storeId: 'store-1' });
          mocks.prisma.posOperator.update.mockResolvedValue({ id: 'op-1' });
          mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', staffVersion: 3 });

          const app = await buildApp();
          await app.inject({
            method: 'PATCH',
            url: '/pos-operators/op-1',
            payload: { pin: '5678' },
          });

          const call = mocks.prisma.posOperator.update.mock.calls[0][0];
          expect(call.data.pin).toBeUndefined();
          expect(call.data.pinRequired).toBe(true);
          expect(call.data.pinSalt).toMatch(/^[0-9a-f]{32}$/);
          const expectedHash = createHash('sha256').update(call.data.pinSalt + '5678').digest('hex');
          expect(call.data.pinHashSha256).toBe(expectedHash);
          expect(call.select).not.toHaveProperty('pinHashSha256');
          await app.close();
        });

        it('updates pinRequired alone, leaving hash/salt untouched, when no pin is given', async () => {
          mocks.prisma.posOperator.findFirst.mockResolvedValue({ id: 'op-1', storeId: 'store-1' });
          mocks.prisma.posOperator.update.mockResolvedValue({ id: 'op-1' });
          mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', staffVersion: 3 });

          const app = await buildApp();
          await app.inject({
            method: 'PATCH',
            url: '/pos-operators/op-1',
            payload: { pinRequired: false },
          });

          expect(mocks.prisma.posOperator.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { pinRequired: false } })
          );
          const data = mocks.prisma.posOperator.update.mock.calls[0][0].data;
          expect(data).not.toHaveProperty('pinHashSha256');
          expect(data).not.toHaveProperty('pinSalt');
          await app.close();
        });

        it('touches no PIN column at all when neither pin nor pinRequired is given', async () => {
          mocks.prisma.posOperator.findFirst.mockResolvedValue({ id: 'op-1', storeId: 'store-1' });
          mocks.prisma.posOperator.update.mockResolvedValue({ id: 'op-1' });
          mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', staffVersion: 3 });

          const app = await buildApp();
          await app.inject({
            method: 'PATCH',
            url: '/pos-operators/op-1',
            payload: { name: 'Alice B.' },
          });

          expect(mocks.prisma.posOperator.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { name: 'Alice B.' } })
          );
          await app.close();
        });
      });
    });

    // docs/POS_POLICY_ENGINE.md §14.1.
    describe('DELETE /pos-operators/:id/pin', () => {
      it('resets pinRequired/hash/salt for an operator belonging to the tenant', async () => {
        mocks.prisma.posOperator.findFirst.mockResolvedValue({ id: 'op-1', storeId: 'store-1' });
        mocks.prisma.posOperator.update.mockResolvedValue({ id: 'op-1', pinRequired: false });
        mocks.prisma.posSettings.upsert.mockResolvedValue({ storeId: 'store-1', staffVersion: 5 });

        const app = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/pos-operators/op-1/pin' });

        expect(response.statusCode).toBe(200);
        expect(mocks.prisma.posOperator.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'op-1' },
            data: { pinRequired: false, pinHashSha256: null, pinSalt: null },
          })
        );
        expect(mocks.prisma.posSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ where: { storeId: 'store-1' }, update: { staffVersion: { increment: 1 } } })
        );
        await app.close();
      });

      it('returns 404 (tenant isolation) for an operator belonging to another tenant', async () => {
        mocks.prisma.posOperator.findFirst.mockResolvedValue(null);

        const app = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/pos-operators/op-foreign/pin' });

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
      // No unit on either item → defaults to 'шт', qty summed as-is.
      expect(data.topProducts).toEqual([{ name: 'Coffee', qty: 3, amount: 15000, unit: 'шт' }]);
      expect(Array.isArray(data.byDay)).toBe(true);
      expect(data.byDay.length).toBeGreaterThan(0);
      await app.close();
    });

    // Weighted-item qty conversion fix — grams accumulate in the native
    // unit across receipts, converted to кг only in the final top-10 slice.
    it('converts a кг-unit product\'s accumulated qty from grams to кг with 3 decimals', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      mocks.prisma.shiftEvent.count.mockResolvedValue(0);
      mocks.prisma.shiftEvent.findMany.mockResolvedValue([]);
      mocks.prisma.fiscalEvent.findMany.mockResolvedValue([
        {
          receiptType: 'SALE', totalAmount: 24500, createdAtMs: new Date('2026-07-01T10:00:00Z'),
          payments: [{ type: 'CASH', sum: 24500 }],
          items: [
            { name: 'Bananas', qty: 1234, unit: 'кг', sum: 14500 },
            { name: 'Bananas', qty: 500, unit: 'KG', sum: 5000 },
            { name: 'Water bottle', qty: 2, unit: 'шт', sum: 5000 },
          ],
        },
      ]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-analytics?storeId=store-1&period=today' });

      expect(response.statusCode).toBe(200);
      const { data } = response.json();
      // (1234 + 500) g summed in native units first, THEN /1000 once —
      // not each occurrence divided independently and re-summed.
      expect(data.topProducts).toEqual(
        expect.arrayContaining([
          { name: 'Bananas', qty: 1.734, amount: 19500, unit: 'кг' },
          { name: 'Water bottle', qty: 2, amount: 5000, unit: 'шт' },
        ])
      );
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

  describe('PaymentTerminal CRUD (docs/POS_SETTINGS_ARCHITECTURE.md §9 step 4)', () => {
    beforeEach(() => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    });

    describe('GET /payment-terminals', () => {
      it('masks apiKey and similar secret keys in config, leaves other keys untouched', async () => {
        mocks.prisma.paymentTerminal.findMany.mockResolvedValue([
          {
            id: 'pt-1', storeId: 'store-1', deviceId: null, type: 'QR_UZQR', name: 'UzQR',
            enabled: true, sortOrder: 0,
            config: { url: 'https://uzqr.uz', tin: '123456789', apiKey: 'super-secret', retryCount: 5 },
          },
        ]);

        const app = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/payment-terminals?storeId=store-1' });

        expect(response.statusCode).toBe(200);
        const [terminal] = response.json().data;
        expect(terminal.config).toEqual({
          url: 'https://uzqr.uz', tin: '123456789', apiKey: '••••••', retryCount: 5,
        });
        await app.close();
      });

      it('returns 404 for a store belonging to another tenant', async () => {
        mocks.prisma.store.findFirst.mockResolvedValue(null);
        const app = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/payment-terminals?storeId=store-foreign' });
        expect(response.statusCode).toBe(404);
        await app.close();
      });
    });

    describe('POST /payment-terminals', () => {
      it('creates a store-level terminal (deviceId omitted) and masks the response', async () => {
        mocks.prisma.paymentTerminal.create.mockResolvedValue({
          id: 'pt-1', storeId: 'store-1', deviceId: null, type: 'CASH', name: 'Наличные',
          enabled: true, sortOrder: 0, config: {},
        });

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/payment-terminals',
          payload: { storeId: 'store-1', type: 'CASH', name: 'Наличные' },
        });

        expect(response.statusCode).toBe(201);
        expect(mocks.prisma.paymentTerminal.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ storeId: 'store-1', deviceId: null, type: 'CASH', name: 'Наличные', enabled: true, sortOrder: 0 }),
        });
        expect(mocks.prisma.posDevice.findFirst).not.toHaveBeenCalled();
        await app.close();
      });

      it('encrypts secret-shaped config keys before create', async () => {
        mocks.prisma.paymentTerminal.create.mockResolvedValue({
          id: 'pt-3', storeId: 'store-1', deviceId: null, type: 'QR_UZQR', name: 'UzQR',
          enabled: true, sortOrder: 0, config: { url: 'https://uzqr.uz', apiKey: 'encrypted(plain-key-123)' },
        });

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/payment-terminals',
          payload: { storeId: 'store-1', type: 'QR_UZQR', name: 'UzQR', config: { url: 'https://uzqr.uz', apiKey: 'plain-key-123' } },
        });

        expect(response.statusCode).toBe(201);
        expect(mocks.encrypt).toHaveBeenCalledWith('plain-key-123');
        expect(mocks.prisma.paymentTerminal.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ config: { url: 'https://uzqr.uz', apiKey: 'encrypted(plain-key-123)' } }),
        });
        // Non-secret keys (url) pass through untouched.
        expect(mocks.encrypt).not.toHaveBeenCalledWith('https://uzqr.uz');
        await app.close();
      });

      it('creates a device-level override after confirming the device belongs to this store', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue({ id: 'dev-1' });
        mocks.prisma.paymentTerminal.create.mockResolvedValue({
          id: 'pt-2', storeId: 'store-1', deviceId: 'dev-1', type: 'CASH', name: 'Наличные (касса 2)',
          enabled: true, sortOrder: 0, config: {},
        });

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/payment-terminals',
          payload: { storeId: 'store-1', deviceId: 'dev-1', type: 'CASH', name: 'Наличные (касса 2)' },
        });

        expect(response.statusCode).toBe(201);
        expect(mocks.prisma.posDevice.findFirst).toHaveBeenCalledWith({
          where: { id: 'dev-1', storeId: 'store-1', tenantId: 'tenant-1' },
          select: { id: true },
        });
        expect(response.json().data.deviceId).toBe('dev-1');
        await app.close();
      });

      it('returns 404 when deviceId does not belong to this store', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue(null);

        const app = await buildApp();
        const response = await app.inject({
          method: 'POST',
          url: '/payment-terminals',
          payload: { storeId: 'store-1', deviceId: 'dev-foreign', type: 'CASH', name: 'Наличные' },
        });

        expect(response.statusCode).toBe(404);
        expect(mocks.prisma.paymentTerminal.create).not.toHaveBeenCalled();
        await app.close();
      });
    });

    describe('PATCH /payment-terminals/:id', () => {
      it('updates a terminal and masks the response', async () => {
        mocks.prisma.paymentTerminal.findFirst.mockResolvedValue({ id: 'pt-1', storeId: 'store-1' });
        mocks.prisma.paymentTerminal.update.mockResolvedValue({
          id: 'pt-1', storeId: 'store-1', deviceId: null, type: 'QR_UZQR', name: 'UzQR',
          enabled: false, sortOrder: 0, config: { apiKey: 'super-secret' },
        });

        const app = await buildApp();
        const response = await app.inject({
          method: 'PATCH',
          url: '/payment-terminals/pt-1',
          payload: { enabled: false },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.config).toEqual({ apiKey: '••••••' });
        await app.close();
      });

      // docs/POS_SETTINGS_ARCHITECTURE.md §8 — the admin UI always sends
      // back whatever config GET /payment-terminals showed it, and that
      // response always masks secret keys to "••••••" (never the real
      // value). An untouched masked field must not overwrite the real
      // stored secret with that literal placeholder string.
      it('preserves the existing stored (encrypted) value for a masked secret field left unchanged in the request', async () => {
        mocks.prisma.paymentTerminal.findFirst.mockResolvedValue({
          id: 'pt-1', storeId: 'store-1', config: { url: 'https://uzqr.uz', apiKey: FAKE_CIPHERTEXT },
        });
        mocks.prisma.paymentTerminal.update.mockResolvedValue({
          id: 'pt-1', storeId: 'store-1', deviceId: null, type: 'QR_UZQR', name: 'UzQR',
          enabled: true, sortOrder: 0, config: { url: 'https://uzqr.uz/v2', apiKey: FAKE_CIPHERTEXT },
        });

        const app = await buildApp();
        const response = await app.inject({
          method: 'PATCH',
          url: '/payment-terminals/pt-1',
          // url changed for real; apiKey sent back exactly as the UI
          // displayed it (masked) — never edited by the admin.
          payload: { config: { url: 'https://uzqr.uz/v2', apiKey: '••••••' } },
        });

        expect(response.statusCode).toBe(200);
        expect(mocks.prisma.paymentTerminal.update).toHaveBeenCalledWith({
          where: { id: 'pt-1' },
          data: expect.objectContaining({ config: { url: 'https://uzqr.uz/v2', apiKey: FAKE_CIPHERTEXT } }),
        });
        // Preserved verbatim, not re-encrypted — encrypt() never called
        // for a value encryptSecrets already recognizes as ciphertext.
        expect(mocks.encrypt).not.toHaveBeenCalled();
        // The response itself is still masked like every other admin-facing read.
        expect(response.json().data.config.apiKey).toBe('••••••');
        await app.close();
      });

      // Merge now starts from existing.config, not just the PATCH body
      // (admin-routes.ts comment on the merge step) — a key present in
      // the stored config but omitted from this request must survive.
      it('keeps a config key present in the stored config but omitted from the PATCH body', async () => {
        mocks.prisma.paymentTerminal.findFirst.mockResolvedValue({
          id: 'pt-1', storeId: 'store-1', config: { url: 'https://uzqr.uz', retryCount: 5 },
        });
        mocks.prisma.paymentTerminal.update.mockResolvedValue({
          id: 'pt-1', storeId: 'store-1', deviceId: null, type: 'QR_UZQR', name: 'UzQR',
          enabled: true, sortOrder: 0, config: { url: 'https://uzqr.uz/v2', retryCount: 5 },
        });

        const app = await buildApp();
        await app.inject({
          method: 'PATCH',
          url: '/payment-terminals/pt-1',
          // retryCount omitted entirely — must not be dropped from storage.
          payload: { config: { url: 'https://uzqr.uz/v2' } },
        });

        expect(mocks.prisma.paymentTerminal.update).toHaveBeenCalledWith({
          where: { id: 'pt-1' },
          data: expect.objectContaining({ config: { url: 'https://uzqr.uz/v2', retryCount: 5 } }),
        });
        await app.close();
      });

      it('encrypts a genuinely new secret value as given, not preserved', async () => {
        mocks.prisma.paymentTerminal.findFirst.mockResolvedValue({
          id: 'pt-1', storeId: 'store-1', config: { apiKey: FAKE_CIPHERTEXT },
        });
        mocks.prisma.paymentTerminal.update.mockResolvedValue({
          id: 'pt-1', storeId: 'store-1', deviceId: null, type: 'QR_UZQR', name: 'UzQR',
          enabled: true, sortOrder: 0, config: { apiKey: 'encrypted(brand-new-secret)' },
        });

        const app = await buildApp();
        const response = await app.inject({
          method: 'PATCH',
          url: '/payment-terminals/pt-1',
          payload: { config: { apiKey: 'brand-new-secret' } },
        });

        expect(response.statusCode).toBe(200);
        expect(mocks.encrypt).toHaveBeenCalledWith('brand-new-secret');
        expect(mocks.prisma.paymentTerminal.update).toHaveBeenCalledWith({
          where: { id: 'pt-1' },
          data: expect.objectContaining({ config: { apiKey: 'encrypted(brand-new-secret)' } }),
        });
        await app.close();
      });

      it('returns 404 for a terminal belonging to another tenant', async () => {
        mocks.prisma.paymentTerminal.findFirst.mockResolvedValue(null);
        const app = await buildApp();
        const response = await app.inject({ method: 'PATCH', url: '/payment-terminals/pt-foreign', payload: { enabled: false } });
        expect(response.statusCode).toBe(404);
        expect(mocks.prisma.paymentTerminal.update).not.toHaveBeenCalled();
        await app.close();
      });
    });

    describe('DELETE /payment-terminals/:id', () => {
      it('deletes a terminal', async () => {
        mocks.prisma.paymentTerminal.findFirst.mockResolvedValue({ id: 'pt-1' });
        const app = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/payment-terminals/pt-1' });
        expect(response.statusCode).toBe(200);
        expect(mocks.prisma.paymentTerminal.delete).toHaveBeenCalledWith({ where: { id: 'pt-1' } });
        await app.close();
      });

      it('returns 404 for a terminal belonging to another tenant', async () => {
        mocks.prisma.paymentTerminal.findFirst.mockResolvedValue(null);
        const app = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/payment-terminals/pt-foreign' });
        expect(response.statusCode).toBe(404);
        expect(mocks.prisma.paymentTerminal.delete).not.toHaveBeenCalled();
        await app.close();
      });
    });
  });

  describe('GET /pos-payment-events (docs/POS_SYNC_API.md §25)', () => {
    beforeEach(() => {
      mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    });

    it('returns payment events for the store, cursor-paginated, newest first', async () => {
      mocks.prisma.posPaymentEvent.findMany.mockResolvedValue([
        {
          id: 'payevt-1', eventType: 'PAYMENT_CONFIRMED', aggregateId: 'UZQR:INV-1', provider: 'UZQR',
          paymentMethod: 'UZQR', operation: 'SALE', status: 'CONFIRMED', amount: 2500000, currency: 'UZS',
          providerPaymentId: 'rrn-1', providerInvoiceId: 'inv-1', providerRefundId: null,
          saleId: 'SALE-1', refundId: null, fiscalReceiptId: null,
          cashierId: 'op-1', cashierName: 'Alice', cashierRole: 'cashier',
          reason: null, rawProviderStatus: { code: '00' }, createdAt: new Date(), deviceId: 'dev-1',
          device: { name: 'Till 1' },
        },
      ]);

      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-payment-events?storeId=store-1' });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.posPaymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', storeId: 'store-1' },
          orderBy: { createdAt: 'desc' },
          take: 25,
        })
      );
      expect(response.json().data.items).toHaveLength(1);
      expect(response.json().data.items[0].provider).toBe('UZQR');
      await app.close();
    });

    it('filters by deviceId and provider when given', async () => {
      const app = await buildApp();
      await app.inject({ method: 'GET', url: '/pos-payment-events?storeId=store-1&deviceId=dev-1&provider=UZQR' });

      expect(mocks.prisma.posPaymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', storeId: 'store-1', deviceId: 'dev-1', provider: 'UZQR' },
        })
      );
      await app.close();
    });

    it('returns 404 for a store belonging to another tenant', async () => {
      mocks.prisma.store.findFirst.mockResolvedValue(null);
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-payment-events?storeId=store-foreign' });
      expect(response.statusCode).toBe(404);
      expect(mocks.prisma.posPaymentEvent.findMany).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 400 when storeId is missing', async () => {
      const app = await buildApp();
      const response = await app.inject({ method: 'GET', url: '/pos-payment-events' });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('GET/PUT /pos-devices/:deviceId/settings (docs/POS_SETTINGS_ARCHITECTURE.md §6)', () => {
    describe('GET', () => {
      it('returns all-null defaults for a device with no PosDeviceSettings row', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue({ id: 'dev-1' });
        mocks.prisma.posDeviceSettings.findUnique.mockResolvedValue(null);

        const app = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/pos-devices/dev-1/settings' });

        expect(response.statusCode).toBe(200);
        expect(response.json().data).toEqual({
          printer: null, scanner: null, pinPad: null, scale: null, display: null, updatedAt: null,
        });
        await app.close();
      });

      it('returns the stored profile for a configured device', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue({ id: 'dev-1' });
        mocks.prisma.posDeviceSettings.findUnique.mockResolvedValue({
          printer: { type: 'THERMAL', paperWidth: 58 },
          scanner: null, pinPad: null, scale: null, display: null,
          updatedAt: new Date('2026-07-18T00:00:00Z'),
        });

        const app = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/pos-devices/dev-1/settings' });

        expect(response.statusCode).toBe(200);
        expect(response.json().data.printer).toEqual({ type: 'THERMAL', paperWidth: 58 });
        await app.close();
      });

      it('returns 404 for a device belonging to another tenant', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue(null);
        const app = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/pos-devices/dev-foreign/settings' });
        expect(response.statusCode).toBe(404);
        expect(mocks.prisma.posDeviceSettings.findUnique).not.toHaveBeenCalled();
        await app.close();
      });
    });

    describe('PUT', () => {
      it('creates a hardware profile for a device with none yet', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue({ id: 'dev-1' });
        mocks.prisma.posDeviceSettings.upsert.mockResolvedValue({
          printer: { type: 'THERMAL', paperWidth: 58 },
          scanner: null, pinPad: null, scale: null, display: null,
          updatedAt: new Date('2026-07-18T00:00:00Z'),
        });

        const app = await buildApp();
        const response = await app.inject({
          method: 'PUT',
          url: '/pos-devices/dev-1/settings',
          payload: { printer: { type: 'THERMAL', paperWidth: 58 } },
        });

        expect(response.statusCode).toBe(200);
        expect(mocks.prisma.posDeviceSettings.upsert).toHaveBeenCalledWith({
          where: { deviceId: 'dev-1' },
          create: {
            deviceId: 'dev-1',
            printer: { type: 'THERMAL', paperWidth: 58 },
            scanner: undefined,
            pinPad: undefined,
            scale: undefined,
            display: undefined,
          },
          update: {
            printer: { type: 'THERMAL', paperWidth: 58 },
            scanner: undefined,
            pinPad: undefined,
            scale: undefined,
            display: undefined,
          },
          select: { printer: true, scanner: true, pinPad: true, scale: true, display: true, updatedAt: true },
        });
        await app.close();
      });

      // §6 — a PUT sending only one section must not touch the others;
      // omitted keys arrive as `undefined` in the Prisma `update` data,
      // which Prisma itself treats as "leave this column alone" (not a
      // literal write of `undefined`) — this test locks in that the
      // route handler passes the keys through as-is rather than
      // defaulting them to `null`, which would instead clear them.
      it('only sends the section present in the request body, leaving the rest untouched', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue({ id: 'dev-1' });
        mocks.prisma.posDeviceSettings.upsert.mockResolvedValue({
          printer: null, scanner: { port: 'COM3', baudRate: 9600 }, pinPad: null, scale: null, display: null,
          updatedAt: new Date(),
        });

        const app = await buildApp();
        await app.inject({
          method: 'PUT',
          url: '/pos-devices/dev-1/settings',
          payload: { scanner: { port: 'COM3', baudRate: 9600 } },
        });

        const call = mocks.prisma.posDeviceSettings.upsert.mock.calls[0][0];
        expect(call.update.scanner).toEqual({ port: 'COM3', baudRate: 9600 });
        expect(call.update.printer).toBeUndefined();
        expect(call.update.pinPad).toBeUndefined();
        await app.close();
      });

      it('clears a section when explicitly sent as null', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue({ id: 'dev-1' });
        mocks.prisma.posDeviceSettings.upsert.mockResolvedValue({
          printer: null, scanner: null, pinPad: null, scale: null, display: null, updatedAt: new Date(),
        });

        const app = await buildApp();
        await app.inject({
          method: 'PUT',
          url: '/pos-devices/dev-1/settings',
          payload: { printer: null },
        });

        const call = mocks.prisma.posDeviceSettings.upsert.mock.calls[0][0];
        expect(call.update.printer).toBeNull();
        await app.close();
      });

      it('returns 404 for a device belonging to another tenant', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue(null);
        const app = await buildApp();
        const response = await app.inject({
          method: 'PUT',
          url: '/pos-devices/dev-foreign/settings',
          payload: { printer: { type: 'THERMAL' } },
        });
        expect(response.statusCode).toBe(404);
        expect(mocks.prisma.posDeviceSettings.upsert).not.toHaveBeenCalled();
        await app.close();
      });

      it('returns 400 for an invalid body', async () => {
        mocks.prisma.posDevice.findFirst.mockResolvedValue({ id: 'dev-1' });
        const app = await buildApp();
        const response = await app.inject({
          method: 'PUT',
          url: '/pos-devices/dev-1/settings',
          payload: { printer: 'not-an-object' },
        });
        expect(response.statusCode).toBe(400);
        expect(mocks.prisma.posDeviceSettings.upsert).not.toHaveBeenCalled();
        await app.close();
      });
    });
  });
});
