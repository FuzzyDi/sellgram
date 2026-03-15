import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanDb,
  createTestCustomer,
  createTestLoyaltyConfig,
  createTestOrder,
  createTestProduct,
  createTestStore,
  createTestTenant,
  testPrisma,
} from '../../test/db-helpers.js';
import { updateOrderStatus } from './order.service.js';

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('order.service integration', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('returns stock when CONFIRMED order is CANCELLED', async () => {
    const tenant = await createTestTenant('order-cancel');
    const store = await createTestStore(tenant.id);
    const product = await createTestProduct(tenant.id, { stockQty: 10, price: 5000 });
    const customer = await createTestCustomer(tenant.id);

    // Create order in CONFIRMED state with 3 units
    const order = await testPrisma.order.create({
      data: {
        tenantId: tenant.id,
        storeId: store.id,
        customerId: customer.id,
        orderNumber: 1,
        status: 'CONFIRMED',
        deliveryType: 'PICKUP',
        subtotal: 15000,
        total: 15000,
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        items: {
          create: [
            {
              productId: product.id,
              name: product.name,
              price: 5000,
              qty: 3,
              total: 15000,
            },
          ],
        },
      },
    });

    // Manually decrement stock to simulate what CONFIRMED did
    await testPrisma.product.update({
      where: { id: product.id },
      data: { stockQty: { decrement: 3 } },
    });

    await updateOrderStatus({
      orderId: order.id,
      tenantId: tenant.id,
      actorUserId: 'admin-1',
      status: 'CANCELLED',
      cancelReason: 'Customer request',
    });

    const updatedProduct = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct!.stockQty).toBe(10); // 7 + 3 = 10, fully restored
  });

  it('awards loyalty points on COMPLETED', async () => {
    const tenant = await createTestTenant('order-loyalty-earn');
    const store = await createTestStore(tenant.id);
    const customer = await createTestCustomer(tenant.id);
    await createTestLoyaltyConfig(tenant.id); // 1pt per 10000 UZS

    const order = await testPrisma.order.create({
      data: {
        tenantId: tenant.id,
        storeId: store.id,
        customerId: customer.id,
        orderNumber: 1,
        status: 'DELIVERED',
        deliveryType: 'PICKUP',
        subtotal: 50000,
        total: 50000,
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        items: { create: [] },
      },
    });

    await updateOrderStatus({
      orderId: order.id,
      tenantId: tenant.id,
      actorUserId: 'admin-1',
      status: 'COMPLETED',
    });

    const updatedCustomer = await testPrisma.customer.findUnique({ where: { id: customer.id } });
    // 50000 / 10000 = 5 points
    expect(updatedCustomer!.loyaltyPoints).toBe(5);

    const txns = await testPrisma.loyaltyTransaction.findMany({ where: { orderId: order.id } });
    expect(txns).toHaveLength(1);
    expect(txns[0].type).toBe('EARN');
    expect(txns[0].points).toBe(5);
  });

  it('throws ORDER_CONCURRENT_MODIFICATION when same order updated twice concurrently', async () => {
    const tenant = await createTestTenant('order-concurrent');
    const store = await createTestStore(tenant.id);
    const customer = await createTestCustomer(tenant.id);

    const order = await testPrisma.order.create({
      data: {
        tenantId: tenant.id,
        storeId: store.id,
        customerId: customer.id,
        orderNumber: 1,
        status: 'DELIVERED',
        deliveryType: 'PICKUP',
        subtotal: 10000,
        total: 10000,
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        items: { create: [] },
      },
    });

    const results = await Promise.allSettled([
      updateOrderStatus({
        orderId: order.id,
        tenantId: tenant.id,
        actorUserId: 'admin-1',
        status: 'COMPLETED',
      }),
      updateOrderStatus({
        orderId: order.id,
        tenantId: tenant.id,
        actorUserId: 'admin-2',
        status: 'COMPLETED',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
      'ORDER_CONCURRENT_MODIFICATION'
    );
  });

  it('awards loyalty points exactly once despite concurrent COMPLETED race', async () => {
    const tenant = await createTestTenant('order-loyalty-once');
    const store = await createTestStore(tenant.id);
    const customer = await createTestCustomer(tenant.id);
    await createTestLoyaltyConfig(tenant.id); // 1pt per 10000 UZS

    const order = await testPrisma.order.create({
      data: {
        tenantId: tenant.id,
        storeId: store.id,
        customerId: customer.id,
        orderNumber: 1,
        status: 'DELIVERED',
        deliveryType: 'PICKUP',
        subtotal: 20000,
        total: 20000,
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        items: { create: [] },
      },
    });

    await Promise.allSettled([
      updateOrderStatus({
        orderId: order.id,
        tenantId: tenant.id,
        actorUserId: 'admin-1',
        status: 'COMPLETED',
      }),
      updateOrderStatus({
        orderId: order.id,
        tenantId: tenant.id,
        actorUserId: 'admin-2',
        status: 'COMPLETED',
      }),
    ]);

    const updatedCustomer = await testPrisma.customer.findUnique({ where: { id: customer.id } });
    // 20000 / 10000 = 2 points, awarded exactly once
    expect(updatedCustomer!.loyaltyPoints).toBe(2);

    const txns = await testPrisma.loyaltyTransaction.findMany({ where: { orderId: order.id } });
    expect(txns).toHaveLength(1);
  });

  it('throws BAD_TRANSITION for invalid status change', async () => {
    const tenant = await createTestTenant('order-transition');
    const store = await createTestStore(tenant.id);
    const customer = await createTestCustomer(tenant.id);

    const order = await createTestOrder(tenant.id, store.id, customer.id, { status: 'COMPLETED' });

    await expect(
      updateOrderStatus({
        orderId: order.id,
        tenantId: tenant.id,
        actorUserId: 'admin-1',
        status: 'NEW',
      })
    ).rejects.toThrow('BAD_TRANSITION');
  });
});
