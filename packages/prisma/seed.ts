import { PrismaClient, Plan } from '@prisma/client';
import * as crypto from 'crypto';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function encrypt(text: string): string {
  const key = Buffer.from(
    process.env.ENCRYPTION_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'hex'
  );
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${tag}`;
}

const DEMO_PASSWORD_HASH = '$2b$12$kLQlUKwgxHD1n5Iz10ObW.JGW0Fw80AorCKK/W1b6e15On6LayA2a'; // admin123

async function resetTenantData(tenantId: string) {
  const [orders, products, customers, purchaseOrders, stores] = await Promise.all([
    prisma.order.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.product.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.customer.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.purchaseOrder.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.store.findMany({ where: { tenantId }, select: { id: true } }),
  ]);

  const orderIds = orders.map((o) => o.id);
  const productIds = products.map((p) => p.id);
  const customerIds = customers.map((c) => c.id);
  const purchaseOrderIds = purchaseOrders.map((p) => p.id);
  const storeIds = stores.map((s) => s.id);

  if (orderIds.length > 0) {
    await prisma.orderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  }

  if (customerIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { customerId: { in: customerIds } } });
  } else {
    await prisma.loyaltyTransaction.deleteMany({ where: { tenantId } });
  }

  if (purchaseOrderIds.length > 0) {
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: purchaseOrderIds } } });
  }

  if (storeIds.length > 0) {
    await prisma.broadcastRecipient.deleteMany({ where: { campaign: { storeId: { in: storeIds } } } });
    await prisma.broadcastCampaign.deleteMany({ where: { storeId: { in: storeIds } } });
  } else {
    await prisma.broadcastCampaign.deleteMany({ where: { tenantId } });
  }

  await prisma.order.deleteMany({ where: { tenantId } });
  await prisma.purchaseOrder.deleteMany({ where: { tenantId } });
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.storePaymentMethod.deleteMany({ where: { tenantId } });
  await prisma.deliveryZone.deleteMany({ where: { tenantId } });
  await prisma.loyaltyConfig.deleteMany({ where: { tenantId } });

  if (productIds.length > 0) {
    await prisma.productImage.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
  }

  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.category.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.store.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
}

async function main() {
  console.log('Seeding database...');
  const demoBotToken = process.env.DEMO_BOT_TOKEN || 'DEMO_BOT_TOKEN_REPLACE_ME';

  const existingTenant = await prisma.tenant.findUnique({ where: { slug: 'demo-shop' } });
  let tenantId: string;
  if (existingTenant) {
    tenantId = existingTenant.id;
    await resetTenantData(tenantId);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: 'Demo Shop', plan: Plan.BUSINESS },
    });
  } else {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Demo Shop',
        slug: 'demo-shop',
        plan: Plan.BUSINESS,
      },
    });
    tenantId = tenant.id;
  }

  const user = await prisma.user.create({
    data: {
      tenantId: tenantId,
      email: 'admin@demo.com',
      passwordHash: DEMO_PASSWORD_HASH,
      name: 'Demo Owner',
      role: 'OWNER',
    },
  });

  const manager = await prisma.user.create({
    data: {
      tenantId: tenantId,
      email: 'manager@demo.com',
      passwordHash: DEMO_PASSWORD_HASH,
      name: 'Demo Manager',
      role: 'MANAGER',
    },
  });

  const store = await prisma.store.create({
    data: {
      tenantId: tenantId,
      name: 'Demo Store Tashkent',
      botToken: encrypt(demoBotToken),
      botUsername: 'demo_shopbot',
      welcomeMessage: 'Welcome to Demo Store! Open mini app and place your first order.',
      miniAppUrl: process.env.MINIAPP_URL || 'http://localhost:5174',
    },
  });

  await prisma.storePaymentMethod.createMany({
    data: [
      {
        tenantId: tenantId,
        storeId: store.id,
        provider: 'CASH',
        code: 'cash_on_delivery',
        title: 'Cash On Delivery',
        description: 'Pay when receiving order',
        isDefault: true,
        sortOrder: 1,
      },
      {
        tenantId: tenantId,
        storeId: store.id,
        provider: 'MANUAL_TRANSFER',
        code: 'bank_transfer',
        title: 'Bank Transfer',
        description: 'Transfer to company account and attach transaction ID',
        instructions: 'Account: 2020 8000 9051 XXXX XXXX',
        sortOrder: 2,
      },
      {
        tenantId: tenantId,
        storeId: store.id,
        provider: 'PAYME',
        code: 'payme',
        title: 'Payme',
        description: 'Instant payment via Payme',
        sortOrder: 3,
      },
      {
        tenantId: tenantId,
        storeId: store.id,
        provider: 'CLICK',
        code: 'click',
        title: 'Click',
        description: 'Instant payment via Click',
        sortOrder: 4,
      },
    ],
  });

  const [catClothing, catElectronics, catAccessories] = await Promise.all([
    prisma.category.create({
      data: { tenantId: tenantId, name: 'Clothing', slug: 'clothing', sortOrder: 1 },
    }),
    prisma.category.create({
      data: { tenantId: tenantId, name: 'Electronics', slug: 'electronics', sortOrder: 2 },
    }),
    prisma.category.create({
      data: { tenantId: tenantId, name: 'Accessories', slug: 'accessories', sortOrder: 3 },
    }),
  ]);

  const products = await Promise.all([
    prisma.product.create({
      data: {
        tenantId: tenantId,
        categoryId: catClothing.id,
        name: 'Nike Dri-FIT T-Shirt',
        description: 'Sports t-shirt with sweat-wicking fabric',
        price: 250000,
        costPrice: 150000,
        sku: 'NIKE-DF-001',
        stockQty: 50,
        sortOrder: 1,
        variants: {
          create: [
            { name: 'S', stockQty: 10 },
            { name: 'M', stockQty: 15 },
            { name: 'L', stockQty: 15 },
            { name: 'XL', stockQty: 10 },
          ],
        },
      },
    }),
    prisma.product.create({
      data: {
        tenantId: tenantId,
        categoryId: catElectronics.id,
        name: 'AirPods Pro 2',
        description: 'Wireless earbuds with ANC',
        price: 3200000,
        costPrice: 2500000,
        sku: 'APPLE-APP2-001',
        stockQty: 20,
        sortOrder: 2,
      },
    }),
    prisma.product.create({
      data: {
        tenantId: tenantId,
        categoryId: catAccessories.id,
        name: 'City Backpack',
        description: 'Urban backpack for everyday use',
        price: 280000,
        costPrice: 160000,
        sku: 'CITY-BP-001',
        stockQty: 25,
        sortOrder: 3,
      },
    }),
  ]);

  await prisma.deliveryZone.createMany({
    data: [
      {
        tenantId: tenantId,
        storeId: store.id,
        name: 'Tashkent Center',
        price: 20000,
        freeFrom: 500000,
        etaMin: 60,
        etaMax: 120,
        sortOrder: 1,
      },
      {
        tenantId: tenantId,
        storeId: store.id,
        name: 'Tashkent Suburbs',
        price: 35000,
        freeFrom: 1000000,
        etaMin: 120,
        etaMax: 240,
        sortOrder: 2,
      },
    ],
  });

  await prisma.loyaltyConfig.upsert({
    where: { tenantId: tenantId },
    create: {
      tenantId: tenantId,
      isEnabled: true,
      pointsPerUnit: 1,
      unitAmount: 1000,
      pointValue: 100,
      maxDiscountPct: 30,
      minPointsToRedeem: 100,
    },
    update: {
      isEnabled: true,
      pointsPerUnit: 1,
      unitAmount: 1000,
      pointValue: 100,
      maxDiscountPct: 30,
      minPointsToRedeem: 100,
    },
  });

  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        tenantId: tenantId,
        telegramId: BigInt(123456789),
        telegramUser: 'demo_customer_1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '+998901234567',
        loyaltyPoints: 500,
        totalSpent: 2500000,
        ordersCount: 5,
      },
    }),
    prisma.customer.create({
      data: {
        tenantId: tenantId,
        telegramId: BigInt(223456789),
        telegramUser: 'demo_customer_2',
        firstName: 'Malika',
        lastName: 'Rahimova',
        phone: '+998901112233',
        loyaltyPoints: 120,
        totalSpent: 950000,
        ordersCount: 2,
      },
    }),
  ]);

  const defaultPayment = await prisma.storePaymentMethod.findFirstOrThrow({
    where: { storeId: store.id, isDefault: true },
  });

  const order = await prisma.order.create({
    data: {
      tenantId: tenantId,
      storeId: store.id,
      orderNumber: 1001,
      customerId: customers[0].id,
      status: 'DELIVERED',
      deliveryType: 'LOCAL',
      deliveryAddress: 'Tashkent, Chilanzar district',
      deliveryPrice: 20000,
      subtotal: 530000,
      loyaltyDiscount: 10000,
      loyaltyPointsUsed: 100,
      total: 540000,
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentMethodId: defaultPayment.id,
      paymentMethodCode: defaultPayment.code,
      paymentMethodTitle: defaultPayment.title,
      items: {
        create: [
          {
            productId: products[0].id,
            name: products[0].name,
            price: 250000,
            qty: 2,
            total: 500000,
          },
          {
            productId: products[2].id,
            name: products[2].name,
            price: 30000,
            qty: 1,
            total: 30000,
          },
        ],
      },
    },
  });

  await prisma.orderStatusLog.createMany({
    data: [
      { orderId: order.id, toStatus: 'NEW', changedBy: user.id },
      { orderId: order.id, fromStatus: 'NEW', toStatus: 'CONFIRMED', changedBy: manager.id },
      { orderId: order.id, fromStatus: 'CONFIRMED', toStatus: 'PREPARING', changedBy: manager.id },
      { orderId: order.id, fromStatus: 'PREPARING', toStatus: 'READY', changedBy: manager.id },
      { orderId: order.id, fromStatus: 'READY', toStatus: 'SHIPPED', changedBy: manager.id },
      { orderId: order.id, fromStatus: 'SHIPPED', toStatus: 'DELIVERED', changedBy: manager.id },
    ],
  });

  await prisma.purchaseOrder.create({
    data: {
      tenantId: tenantId,
      poNumber: 1,
      supplierName: 'Global Trade LLC',
      status: 'RECEIVED',
      currency: 'USD',
      fxRate: 12800,
      shippingCost: 500000,
      customsCost: 200000,
      totalCost: 1000,
      totalLanded: 13500000,
      orderedAt: new Date('2026-02-15'),
      receivedAt: new Date('2026-02-25'),
      items: {
        create: [
          {
            productId: products[1].id,
            qty: 5,
            unitCost: 200,
            totalCost: 1000,
            qtyReceived: 5,
          },
        ],
      },
    },
  });

  await prisma.invoice.create({
    data: {
      tenantId: tenantId,
      plan: 'BUSINESS',
      amount: 799000,
      currency: 'UZS',
      status: 'PENDING',
      paymentRef: 'DEMO-TX-001',
      paymentNote: 'Demo payment transfer',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  });

  const systemEmail = process.env.SYSTEM_ADMIN_EMAIL || 'root@sellgram.uz';
  const systemPassword = process.env.SYSTEM_ADMIN_PASSWORD || 'ChangeMe_123!';
  const systemHash = await bcrypt.hash(systemPassword, 10);

  await prisma.systemAdmin.upsert({
    where: { email: systemEmail },
    update: { passwordHash: systemHash, isActive: true, name: 'System Admin' },
    create: {
      email: systemEmail,
      passwordHash: systemHash,
      name: 'System Admin',
    },
  });

  console.log('Seed completed successfully.');
  console.log('Admin panel: admin@demo.com / admin123');
  console.log(`Demo bot token source: ${process.env.DEMO_BOT_TOKEN ? 'DEMO_BOT_TOKEN' : 'fallback placeholder (set DEMO_BOT_TOKEN)'}`);
  console.log(`System admin: ${systemEmail} / ${systemPassword}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

