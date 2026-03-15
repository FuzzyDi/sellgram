import { PrismaClient } from '@prisma/client';
import { validateStorePaymentMethodConfig } from '../../payments/validators.js';
import type { CreatePaymentMethodInput, UpdatePaymentMethodInput } from './payment-methods.dto.js';

export async function ensureStoreForTenant(
  db: PrismaClient,
  input: { tenantId: string; storeId: string }
) {
  const store = await db.store.findFirst({ where: { id: input.storeId, tenantId: input.tenantId } });
  if (!store) {
    throw new Error('STORE_NOT_FOUND');
  }
  return store;
}

export async function listStorePaymentMethods(
  db: PrismaClient,
  input: { tenantId: string; storeId: string }
) {
  return db.storePaymentMethod.findMany({
    where: { storeId: input.storeId, tenantId: input.tenantId },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createStorePaymentMethod(
  db: PrismaClient,
  input: { tenantId: string; storeId: string; data: CreatePaymentMethodInput }
) {
  validateStorePaymentMethodConfig({ provider: input.data.provider, meta: input.data.meta as any });

  return db.$transaction(async (tx: any) => {
    if (input.data.isDefault) {
      await tx.storePaymentMethod.updateMany({
        where: { storeId: input.storeId, tenantId: input.tenantId },
        data: { isDefault: false },
      });
    }

    return tx.storePaymentMethod.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        ...input.data,
        isDefault: input.data.isDefault ?? false,
        sortOrder: input.data.sortOrder ?? 0,
      },
    });
  });
}

export async function updateStorePaymentMethod(
  db: PrismaClient,
  input: { tenantId: string; storeId: string; methodId: string; data: UpdatePaymentMethodInput }
) {
  const method = await db.storePaymentMethod.findFirst({
    where: { id: input.methodId, storeId: input.storeId, tenantId: input.tenantId },
  });

  if (!method) {
    throw new Error('PAYMENT_METHOD_NOT_FOUND');
  }

  validateStorePaymentMethodConfig({
    provider: input.data.provider ?? method.provider,
    meta: (input.data.meta ?? method.meta) as any,
  });

  return db.$transaction(async (tx: any) => {
    if (input.data.isDefault) {
      await tx.storePaymentMethod.updateMany({
        where: { storeId: input.storeId, tenantId: input.tenantId },
        data: { isDefault: false },
      });
    }

    return tx.storePaymentMethod.update({
      where: { id: input.methodId },
      data: input.data as any,
    });
  });
}

export async function archiveStorePaymentMethod(
  db: PrismaClient,
  input: { tenantId: string; storeId: string; methodId: string }
) {
  const method = await db.storePaymentMethod.findFirst({
    where: { id: input.methodId, storeId: input.storeId, tenantId: input.tenantId },
  });

  if (!method) {
    throw new Error('PAYMENT_METHOD_NOT_FOUND');
  }

  await db.storePaymentMethod.update({
    where: { id: input.methodId },
    data: { isActive: false, isDefault: false },
  });

  const hasDefault = await db.storePaymentMethod.findFirst({
    where: { storeId: input.storeId, tenantId: input.tenantId, isActive: true, isDefault: true },
  });

  if (!hasDefault) {
    const fallback = await db.storePaymentMethod.findFirst({
      where: { storeId: input.storeId, tenantId: input.tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (fallback) {
      await db.storePaymentMethod.update({
        where: { id: fallback.id },
        data: { isDefault: true },
      });
    }
  }
}
