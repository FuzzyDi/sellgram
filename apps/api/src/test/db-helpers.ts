import { PrismaClient } from '@prisma/client';

// Fresh client for test setup — avoids module-cache issues with lib/prisma.ts
export const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

/**
 * Wipe all tenant-scoped data by deleting tenants (cascades to everything).
 * Call in beforeEach to get a clean DB for each test.
 */
export async function cleanDb() {
  // Cascade: Tenant -> User, Store, Product, Customer, Order, etc.
  await testPrisma.tenant.deleteMany();
  await testPrisma.systemAdmin.deleteMany();
}

export async function createTestTenant(slug = 'test-tenant') {
  return testPrisma.tenant.create({
    data: { name: 'Test Tenant', slug },
  });
}

export async function createTestStore(tenantId: string) {
  return testPrisma.store.create({
    data: {
      tenantId,
      name: 'Test Store',
      botToken: 'enc:test-token',
    },
  });
}

export async function createTestProduct(
  tenantId: string,
  opts: { stockQty?: number; price?: number } = {}
) {
  return testPrisma.product.create({
    data: {
      tenantId,
      name: 'Test Product',
      price: opts.price ?? 10000,
      stockQty: opts.stockQty ?? 100,
      isActive: true,
      sku: `sku-${Date.now()}`,
    },
  });
}

export async function createTestCustomer(tenantId: string, telegramId?: bigint) {
  return testPrisma.customer.create({
    data: {
      tenantId,
      telegramId: telegramId ?? BigInt(Date.now()),
      firstName: 'Test',
    },
  });
}

export async function createTestCartItem(
  customerId: string,
  storeId: string,
  productId: string,
  qty = 1
) {
  return testPrisma.cartItem.create({
    data: { customerId, storeId, productId, qty },
  });
}

export async function createTestPaymentMethod(tenantId: string, storeId: string) {
  return testPrisma.storePaymentMethod.create({
    data: {
      tenantId,
      storeId,
      provider: 'CASH',
      code: 'cash',
      title: 'Cash',
      isDefault: true,
    },
  });
}

export async function createTestLoyaltyConfig(tenantId: string) {
  return testPrisma.loyaltyConfig.create({
    data: {
      tenantId,
      isEnabled: true,
      pointsPerUnit: 1,
      unitAmount: 10000,
      pointValue: 100,
      maxDiscountPct: 30,
      minPointsToRedeem: 1,
    },
  });
}

export async function createTestOrder(
  tenantId: string,
  storeId: string,
  customerId: string,
  opts: { status?: string; total?: number } = {}
) {
  return testPrisma.order.create({
    data: {
      tenantId,
      storeId,
      customerId,
      orderNumber: Math.floor(Math.random() * 1_000_000),
      status: (opts.status ?? 'NEW') as any,
      deliveryType: 'PICKUP',
      subtotal: opts.total ?? 10000,
      total: opts.total ?? 10000,
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
    },
  });
}
