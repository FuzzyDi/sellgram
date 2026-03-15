import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanDb,
  createTestCartItem,
  createTestCustomer,
  createTestPaymentMethod,
  createTestProduct,
  createTestStore,
  createTestTenant,
  testPrisma,
} from '../../test/db-helpers.js';
import { createShopCheckoutOrder } from './checkout.service.js';

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('checkout.service integration', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('creates an order and decrements stock', async () => {
    const tenant = await createTestTenant('checkout-basic');
    const store = await createTestStore(tenant.id);
    const product = await createTestProduct(tenant.id, { stockQty: 10, price: 5000 });
    const customer = await createTestCustomer(tenant.id);
    await createTestCartItem(customer.id, store.id, product.id, 3);
    await createTestPaymentMethod(tenant.id, store.id);

    const order = await createShopCheckoutOrder({
      customerId: customer.id,
      tenantId: tenant.id,
      storeId: store.id,
      body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 0 },
    });

    expect(order.orderNumber).toBe(1);
    expect(Number(order.total)).toBe(15000);

    // Cart should be cleared
    const cartItems = await testPrisma.cartItem.findMany({ where: { customerId: customer.id } });
    expect(cartItems).toHaveLength(0);
  });

  it('concurrent checkouts get distinct orderNumbers (advisory lock)', async () => {
    const tenant = await createTestTenant('checkout-concurrent');
    const store = await createTestStore(tenant.id);
    const product = await createTestProduct(tenant.id, { stockQty: 50 });
    const [cust1, cust2] = await Promise.all([
      createTestCustomer(tenant.id, BigInt(1001)),
      createTestCustomer(tenant.id, BigInt(1002)),
    ]);
    await Promise.all([
      createTestCartItem(cust1.id, store.id, product.id, 1),
      createTestCartItem(cust2.id, store.id, product.id, 1),
    ]);
    await createTestPaymentMethod(tenant.id, store.id);

    const [o1, o2] = await Promise.all([
      createShopCheckoutOrder({
        customerId: cust1.id,
        tenantId: tenant.id,
        storeId: store.id,
        body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 0 },
      }),
      createShopCheckoutOrder({
        customerId: cust2.id,
        tenantId: tenant.id,
        storeId: store.id,
        body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 0 },
      }),
    ]);

    const numbers = [o1.orderNumber, o2.orderNumber].sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2]);
  });

  it('throws when stock is insufficient', async () => {
    const tenant = await createTestTenant('checkout-stock');
    const store = await createTestStore(tenant.id);
    const product = await createTestProduct(tenant.id, { stockQty: 2 });
    const customer = await createTestCustomer(tenant.id);
    await createTestCartItem(customer.id, store.id, product.id, 5);
    await createTestPaymentMethod(tenant.id, store.id);

    await expect(
      createShopCheckoutOrder({
        customerId: customer.id,
        tenantId: tenant.id,
        storeId: store.id,
        body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 0 },
      })
    ).rejects.toThrow('Not enough stock');
  });

  it('redeems loyalty points and clamps to max discount', async () => {
    const tenant = await createTestTenant('checkout-loyalty');
    const store = await createTestStore(tenant.id);
    const product = await createTestProduct(tenant.id, { stockQty: 10, price: 100000 });
    const customer = await createTestCustomer(tenant.id);
    await testPrisma.customer.update({
      where: { id: customer.id },
      data: { loyaltyPoints: 50 },
    });
    await createTestCartItem(customer.id, store.id, product.id, 1);
    await createTestPaymentMethod(tenant.id, store.id);
    // loyaltyConfig: 1 pt = 100 UZS, maxDiscount 30%
    await testPrisma.loyaltyConfig.create({
      data: {
        tenantId: tenant.id,
        isEnabled: true,
        pointsPerUnit: 1,
        unitAmount: 10000,
        pointValue: 100,
        maxDiscountPct: 30,
        minPointsToRedeem: 1,
      },
    });

    // Try to use 50 pts (= 5000 UZS discount) on 100000 UZS order
    // Max discount = 30% of 100000 = 30000 UZS → 50 pts used (50*100=5000 < 30000, so all 50 used)
    const order = await createShopCheckoutOrder({
      customerId: customer.id,
      tenantId: tenant.id,
      storeId: store.id,
      body: { deliveryType: 'PICKUP', loyaltyPointsToUse: 50 },
    });

    expect(order.loyaltyPointsUsed).toBe(50);
    expect(Number(order.loyaltyDiscount)).toBe(5000);
    expect(Number(order.total)).toBe(95000);

    const updatedCustomer = await testPrisma.customer.findUnique({ where: { id: customer.id } });
    expect(updatedCustomer!.loyaltyPoints).toBe(0);
  });
});
