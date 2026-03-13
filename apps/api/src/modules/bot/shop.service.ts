import prisma from '../../lib/prisma.js';

export class ShopApiError extends Error {
  code: 'PRODUCT_NOT_FOUND' | 'ORDER_NOT_FOUND';

  constructor(code: ShopApiError['code']) {
    super(code);
    this.code = code;
  }
}

export async function getShopCatalog(tenantId: string) {
  const categories = await prisma.category.findMany({
    where: { tenantId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: { where: { isActive: true } } } } },
  });

  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true, stockQty: { gt: 0 } },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      category: { select: { id: true, name: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });

  return { categories, products };
}

export async function getShopProduct(tenantId: string, id: string) {
  const product = await prisma.product.findFirst({
    where: { id, tenantId, isActive: true },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { where: { isActive: true } },
      category: { select: { id: true, name: true } },
    },
  });

  if (!product) throw new ShopApiError('PRODUCT_NOT_FOUND');
  return product;
}

export async function getCustomerCart(customerId: string, storeId: string) {
  const items = await prisma.cartItem.findMany({
    where: { customerId, storeId },
  });

  const enrichedItems = await Promise.all(
    items.map(async (item: any) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
      });
      const variant = item.variantId ? await prisma.productVariant.findUnique({ where: { id: item.variantId } }) : null;

      const price = variant?.price ?? product?.price ?? 0;
      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        name: product?.name ?? 'Unknown',
        variantName: variant?.name,
        price: Number(price),
        qty: item.qty,
        total: Number(price) * item.qty,
        image: product?.images[0]?.url,
        inStock: product ? product.stockQty >= item.qty : false,
      };
    })
  );

  const subtotal = enrichedItems.reduce((sum, item) => sum + item.total, 0);
  return { items: enrichedItems, subtotal };
}

export async function listShopDeliveryZones(tenantId: string, storeId: string) {
  return prisma.deliveryZone.findMany({
    where: { storeId, tenantId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function listShopPaymentMethods(tenantId: string, storeId: string) {
  return prisma.storePaymentMethod.findMany({
    where: {
      tenantId,
      storeId,
      isActive: true,
    },
    select: {
      id: true,
      provider: true,
      code: true,
      title: true,
      description: true,
      instructions: true,
      isDefault: true,
      sortOrder: true,
    },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  });
}

export async function listCustomerOrders(customerId: string) {
  return prisma.order.findMany({
    where: { customerId },
    include: {
      items: true,
      store: { select: { name: true } },
      deliveryZone: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

export async function getCustomerOrderById(customerId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    include: {
      items: true,
      statusHistory: { orderBy: { createdAt: 'desc' } },
      deliveryZone: true,
      store: { select: { name: true } },
    },
  });

  if (!order) throw new ShopApiError('ORDER_NOT_FOUND');
  return order;
}

export async function getCustomerLoyalty(customerId: string, tenantId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { loyaltyPoints: true } });
  const config = await prisma.loyaltyConfig.findUnique({ where: { tenantId } });

  const transactions = await prisma.loyaltyTransaction.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return {
    balance: customer?.loyaltyPoints ?? 0,
    config: config ? { pointValue: config.pointValue, unitAmount: config.unitAmount, isEnabled: config.isEnabled } : null,
    transactions,
  };
}
