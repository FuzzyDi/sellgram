import { describe, expect, it, vi } from 'vitest';
import {
  archiveStorePaymentMethod,
  createStorePaymentMethod,
  listStorePaymentMethods,
  updateStorePaymentMethod,
} from './payment-methods.service.js';

function createDbMock() {
  return {
    storePaymentMethod: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  } as any;
}

describe('payment-methods.service', () => {
  it('lists store payment methods with expected ordering', async () => {
    const db = createDbMock();
    db.storePaymentMethod.findMany.mockResolvedValue([{ id: 'pm-1' }]);

    const result = await listStorePaymentMethods(db, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
    });

    expect(db.storePaymentMethod.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', tenantId: 'tenant-1' },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    expect(result).toEqual([{ id: 'pm-1' }]);
  });

  it('creates default payment method and clears previous defaults', async () => {
    const db = createDbMock();
    db.storePaymentMethod.updateMany.mockResolvedValue({ count: 2 });
    db.storePaymentMethod.create.mockResolvedValue({ id: 'pm-new' });

    const result = await createStorePaymentMethod(db, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
      data: {
        provider: 'CLICK',
        code: 'click',
        title: 'Click',
        isDefault: true,
        sortOrder: 0,
        meta: { serviceId: '11', merchantId: '22' },
      },
    });

    expect(db.storePaymentMethod.updateMany).toHaveBeenCalledTimes(1);
    expect(db.storePaymentMethod.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        provider: 'CLICK',
        code: 'click',
        title: 'Click',
        isDefault: true,
        sortOrder: 0,
        meta: { serviceId: '11', merchantId: '22' },
      },
    });
    expect(result).toEqual({ id: 'pm-new' });
  });

  it('does not clear defaults when creating non-default method', async () => {
    const db = createDbMock();
    db.storePaymentMethod.create.mockResolvedValue({ id: 'pm-new' });

    await createStorePaymentMethod(db, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
      data: {
        provider: 'CASH',
        code: 'cash',
        title: 'Cash',
      },
    });

    expect(db.storePaymentMethod.updateMany).not.toHaveBeenCalled();
    expect(db.storePaymentMethod.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        provider: 'CASH',
        code: 'cash',
        title: 'Cash',
        isDefault: false,
        sortOrder: 0,
      },
    });
  });

  it('throws validation error on invalid provider config', async () => {
    const db = createDbMock();

    await expect(
      createStorePaymentMethod(db, {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        data: {
          provider: 'PAYME',
          code: 'payme',
          title: 'Payme',
          meta: {},
        },
      })
    ).rejects.toThrow('PAYME payment requires meta.merchantId');

    expect(db.storePaymentMethod.create).not.toHaveBeenCalled();
  });

  it('throws PAYMENT_METHOD_NOT_FOUND on update when method is missing', async () => {
    const db = createDbMock();
    db.storePaymentMethod.findFirst.mockResolvedValue(null);

    await expect(
      updateStorePaymentMethod(db, {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        methodId: 'pm-404',
        data: { title: 'Updated' },
      })
    ).rejects.toThrow('PAYMENT_METHOD_NOT_FOUND');

    expect(db.storePaymentMethod.update).not.toHaveBeenCalled();
  });

  it('updates method and clears existing defaults when setting isDefault=true', async () => {
    const db = createDbMock();
    db.storePaymentMethod.findFirst.mockResolvedValue({
      id: 'pm-1',
      provider: 'PAYME',
      meta: { merchantId: 'merchant-1' },
    });
    db.storePaymentMethod.updateMany.mockResolvedValue({ count: 1 });
    db.storePaymentMethod.update.mockResolvedValue({ id: 'pm-1', isDefault: true });

    const result = await updateStorePaymentMethod(db, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
      methodId: 'pm-1',
      data: {
        isDefault: true,
        meta: { merchantId: 'merchant-1', paymeAuthKey: 'secret' },
      },
    });

    expect(db.storePaymentMethod.updateMany).toHaveBeenCalledTimes(1);
    expect(db.storePaymentMethod.update).toHaveBeenCalledWith({
      where: { id: 'pm-1' },
      data: {
        isDefault: true,
        meta: { merchantId: 'merchant-1', paymeAuthKey: 'secret' },
      },
    });
    expect(result).toEqual({ id: 'pm-1', isDefault: true });
  });

  it('archives method and promotes fallback default when needed', async () => {
    const db = createDbMock();
    db.storePaymentMethod.findFirst
      .mockResolvedValueOnce({ id: 'pm-1' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'pm-2' });
    db.storePaymentMethod.update.mockResolvedValue({});

    await archiveStorePaymentMethod(db, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
      methodId: 'pm-1',
    });

    expect(db.storePaymentMethod.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'pm-1' },
      data: { isActive: false, isDefault: false },
    });
    expect(db.storePaymentMethod.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'pm-2' },
      data: { isDefault: true },
    });
  });

  it('archives method without fallback promotion when default already exists', async () => {
    const db = createDbMock();
    db.storePaymentMethod.findFirst
      .mockResolvedValueOnce({ id: 'pm-1' })
      .mockResolvedValueOnce({ id: 'pm-default' });
    db.storePaymentMethod.update.mockResolvedValue({});

    await archiveStorePaymentMethod(db, {
      tenantId: 'tenant-1',
      storeId: 'store-1',
      methodId: 'pm-1',
    });

    expect(db.storePaymentMethod.update).toHaveBeenCalledTimes(1);
    expect(db.storePaymentMethod.update).toHaveBeenCalledWith({
      where: { id: 'pm-1' },
      data: { isActive: false, isDefault: false },
    });
  });
});
