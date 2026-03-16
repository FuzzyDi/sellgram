import prisma from '../../lib/prisma.js';

export class ShopApiError extends Error {
  code: 'PRODUCT_NOT_FOUND' | 'ORDER_NOT_FOUND' | 'ORDER_CANNOT_CANCEL' | 'ORDER_CANNOT_REVIEW' | 'REVIEW_ALREADY_SUBMITTED';

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

  if (items.length === 0) return { items: [], subtotal: 0 };

  const productIds = [...new Set(items.map((item) => item.productId))];
  const variantIds = items.map((item) => item.variantId).filter((id): id is string => id != null);

  const [products, variants] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
    }),
    variantIds.length > 0
      ? prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
      : Promise.resolve([] as any[]),
  ]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const variantMap = new Map(variants.map((v) => [v.id, v]));

  const enrichedItems = items.map((item) => {
    const product = productMap.get(item.productId);
    const variant = item.variantId ? variantMap.get(item.variantId) : null;
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
  });

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
      review: { select: { rating: true, comment: true, createdAt: true } },
    },
  });

  if (!order) throw new ShopApiError('ORDER_NOT_FOUND');
  return order;
}

const CANCELLABLE_STATUSES = new Set(['NEW', 'CONFIRMED']);

export async function cancelCustomerOrder(customerId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, customerId }, select: { id: true, status: true } });
  if (!order) throw new ShopApiError('ORDER_NOT_FOUND');
  if (!CANCELLABLE_STATUSES.has(order.status)) throw new ShopApiError('ORDER_CANNOT_CANCEL');

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', updatedAt: new Date() },
    }),
    prisma.orderStatusLog.create({
      data: { orderId: order.id, toStatus: 'CANCELLED', fromStatus: order.status as any, note: 'Cancelled by customer' },
    }),
  ]);

  return { orderId: order.id, status: 'CANCELLED' };
}

const REVIEWABLE_STATUSES = new Set(['DELIVERED', 'COMPLETED']);

export async function submitOrderReview(customerId: string, orderId: string, rating: number, comment?: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    select: { id: true, tenantId: true, status: true, review: { select: { id: true } } },
  });
  if (!order) throw new ShopApiError('ORDER_NOT_FOUND');
  if (!REVIEWABLE_STATUSES.has(order.status)) throw new ShopApiError('ORDER_CANNOT_REVIEW');
  if (order.review) throw new ShopApiError('REVIEW_ALREADY_SUBMITTED');

  await prisma.orderReview.create({
    data: { orderId: order.id, customerId, tenantId: order.tenantId, rating, comment },
  });

  return { orderId: order.id, rating };
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
    config: config ? { pointValue: config.pointValue, unitAmount: config.unitAmount, pointsPerUnit: config.pointsPerUnit, isEnabled: config.isEnabled } : null,
    transactions,
  };
}
