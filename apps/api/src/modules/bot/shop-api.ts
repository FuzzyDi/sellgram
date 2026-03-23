import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import {
  cartAddSchema,
  cartUpdateQtySchema,
  checkoutSchema,
  itemIdParamsSchema,
  reviewOrderSchema,
} from './dto.js';
import {
  getCustomerCart,
  getShopCatalog,
  getShopProduct,
  listShopDeliveryZones,
  listShopPaymentMethods,
  listCustomerOrders,
  getCustomerLoyalty,
  getCustomerOrderById,
  cancelCustomerOrder,
  submitOrderReview,
} from './shop.service.js';
import { createShopCheckoutOrder } from './checkout.service.js';
import { addCartItem, removeCartItem, updateCartItemQty } from './cart.service.js';
import { telegramShopAuth } from './shop-auth.js';
import { sendCodedError } from './http-errors.js';
import { CART_ERROR_STATUS, ORDER_ACTION_ERROR_STATUS, SHOP_READ_ERROR_STATUS } from './errors.js';
import { dispatchWebhook } from '../../lib/webhook-dispatcher.js';


export default async function shopApiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', telegramShopAuth);

  const catalogQuerySchema = z.object({
    q: z.string().max(200).optional(),
    categoryId: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  });

  fastify.get('/shop/catalog', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    let query: z.infer<typeof catalogQuerySchema>;
    try {
      query = catalogQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const [data, banners] = await Promise.all([
      getShopCatalog(request.customer!.tenantId, request.storeId!, query),
      prisma.banner.findMany({
        where: { tenantId: request.customer!.tenantId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, title: true, imageUrl: true, linkUrl: true },
      }),
    ]);
    return { success: true, data: { ...data, banners } };
  });

  fastify.get('/shop/products/:id', async (request, reply) => {
    try {
      const { id } = itemIdParamsSchema.parse(request.params);
      const data = await getShopProduct(request.customer!.tenantId, id);
      return { success: true, data };
    } catch (err: unknown) {
      return sendCodedError(reply, err, SHOP_READ_ERROR_STATUS);
    }
  });

  fastify.get('/shop/cart', async (request) => {
    const data = await getCustomerCart(request.customer!.id, request.storeId!);
    return { success: true, data };
  });

  fastify.post('/shop/cart/items', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = cartAddSchema.parse(request.body);
      const result = await addCartItem({
        customerId: request.customer!.id,
        tenantId: request.customer!.tenantId,
        storeId: request.storeId!,
        productId: body.productId,
        variantId: body.variantId ?? null,
        qty: body.qty,
      });

      return { success: true, message: result.message };
    } catch (err: unknown) {
      return sendCodedError(reply, err, CART_ERROR_STATUS);
    }
  });

  fastify.patch('/shop/cart/items/:id', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const { id } = itemIdParamsSchema.parse(request.params);
      const { qty } = cartUpdateQtySchema.parse(request.body);
      const result = await updateCartItemQty({
        customerId: request.customer!.id,
        tenantId: request.customer!.tenantId,
        itemId: id,
        qty,
      });

      return { success: true, message: result.message };
    } catch (err: unknown) {
      return sendCodedError(reply, err, CART_ERROR_STATUS);
    }
  });

  fastify.delete('/shop/cart/items/:id', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const { id } = itemIdParamsSchema.parse(request.params);
      const result = await removeCartItem({ customerId: request.customer!.id, itemId: id });
      return { success: true, message: result.message };
    } catch (err: unknown) {
      return sendCodedError(reply, err, CART_ERROR_STATUS);
    }
  });

  fastify.get('/shop/delivery-zones', async (request) => {
    const data = await listShopDeliveryZones(request.customer!.tenantId, request.storeId!);
    return { success: true, data };
  });

  fastify.get('/shop/payment-methods', async (request) => {
    const data = await listShopPaymentMethods(request.customer!.tenantId, request.storeId!);
    return { success: true, data };
  });

  fastify.post('/shop/checkout', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = checkoutSchema.parse(request.body);
      const order = await createShopCheckoutOrder({
        customerId: request.customer!.id,
        tenantId: request.customer!.tenantId,
        storeId: request.storeId!,
        body,
      });

      try {
        const { notifyNewOrder } = await import('../../bot/bot-manager.js');
        notifyNewOrder(request.storeId!, { ...order, contactPhone: body.contactPhone }).catch(() => {});
      } catch {}

      dispatchWebhook(request.customer!.tenantId, 'order.created', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        storeId: request.storeId,
      }).catch(() => {});

      return { success: true, data: order };
    } catch (err: unknown) {
      return sendCodedError(reply, err, CART_ERROR_STATUS);
    }
  });

  fastify.get('/shop/orders', async (request) => {
    const data = await listCustomerOrders(request.customer!.id);
    return { success: true, data };
  });

  fastify.get('/shop/orders/:id', async (request, reply) => {
    try {
      const { id } = itemIdParamsSchema.parse(request.params);
      const data = await getCustomerOrderById(request.customer!.id, id);
      return { success: true, data };
    } catch (err: unknown) {
      return sendCodedError(reply, err, SHOP_READ_ERROR_STATUS);
    }
  });

  fastify.post('/shop/orders/:id/cancel', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const { id } = itemIdParamsSchema.parse(request.params);
      const data = await cancelCustomerOrder(request.customer!.id, id);
      return { success: true, data };
    } catch (err: unknown) {
      return sendCodedError(reply, err, ORDER_ACTION_ERROR_STATUS);
    }
  });

  fastify.post('/shop/orders/:id/review', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const { id } = itemIdParamsSchema.parse(request.params);
      const body = reviewOrderSchema.parse(request.body);
      const data = await submitOrderReview(request.customer!.id, id, body.rating, body.comment);
      return { success: true, data };
    } catch (err: unknown) {
      return sendCodedError(reply, err, ORDER_ACTION_ERROR_STATUS);
    }
  });

  fastify.get('/shop/loyalty', async (request) => {
    const data = await getCustomerLoyalty(request.customer!.id, request.customer!.tenantId);
    return { success: true, data };
  });

  // ── Customer profile ───────────────────────────────────────
  fastify.get('/shop/profile', async (request, reply) => {
    const customer = await prisma.customer.findUnique({
      where: { id: request.customer!.id },
      select: {
        id: true, firstName: true, lastName: true, telegramUser: true,
        phone: true, loyaltyPoints: true, ordersCount: true, totalSpent: true, createdAt: true,
      },
    });
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' });
    return { success: true, data: customer };
  });

  fastify.patch('/shop/profile', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = (request.body as any) ?? {};
    const phone = body.phone ? String(body.phone).trim() : undefined;
    if (phone !== undefined && !/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
      return reply.status(400).send({ success: false, error: 'Invalid phone format' });
    }
    const updated = await prisma.customer.update({
      where: { id: request.customer!.id },
      data: { ...(phone !== undefined ? { phone } : {}) },
      select: { id: true, phone: true },
    });
    return { success: true, data: updated };
  });

  // ── Wishlist ──────────────────────────────────────────────
  fastify.get('/shop/wishlist', async (request) => {
    const items = await prisma.wishlistItem.findMany({
      where: { customerId: request.customer!.id },
      include: {
        product: {
          select: {
            id: true, name: true, price: true, isActive: true,
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: items.filter((i) => i.product.isActive) };
  });

  fastify.post('/shop/wishlist/:productId', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { productId } = (request.params as any);
    await prisma.wishlistItem.upsert({
      where: { customerId_productId: { customerId: request.customer!.id, productId } },
      create: { customerId: request.customer!.id, productId, tenantId: request.customer!.tenantId },
      update: {},
    });
    return { success: true };
  });

  fastify.delete('/shop/wishlist/:productId', async (request, reply) => {
    const { productId } = (request.params as any);
    await prisma.wishlistItem.deleteMany({
      where: { customerId: request.customer!.id, productId },
    });
    return { success: true };
  });

  // ── Promo codes ───────────────────────────────────────────
  fastify.post('/shop/promo/validate', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { code, orderTotal } = (request.body as any) ?? {};
    if (!code) return reply.status(400).send({ success: false, error: 'code required' });
    const promo = await prisma.promoCode.findUnique({
      where: { tenantId_code: { tenantId: request.customer!.tenantId, code: String(code).trim().toUpperCase() } },
    });
    if (!promo || !promo.isActive) return reply.status(404).send({ success: false, error: 'PROMO_NOT_FOUND' });
    if (promo.expiresAt && promo.expiresAt < new Date()) return reply.status(400).send({ success: false, error: 'PROMO_EXPIRED' });
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) return reply.status(400).send({ success: false, error: 'PROMO_EXHAUSTED' });
    if (promo.minOrderAmount != null && orderTotal != null && Number(orderTotal) < Number(promo.minOrderAmount)) {
      return reply.status(400).send({ success: false, error: 'PROMO_MIN_ORDER', minOrder: Number(promo.minOrderAmount) });
    }
    const discount = promo.type === 'PERCENT'
      ? Math.round(Number(orderTotal ?? 0) * Number(promo.value) / 100)
      : Number(promo.value);
    return { success: true, data: { id: promo.id, type: promo.type, value: Number(promo.value), discount } };
  });
}


