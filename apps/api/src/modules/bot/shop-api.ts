import { FastifyInstance } from 'fastify';
import {
  cartAddSchema,
  cartUpdateQtySchema,
  checkoutSchema,
  itemIdParamsSchema,
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
} from './shop.service.js';
import { createShopCheckoutOrder } from './checkout.service.js';
import { addCartItem, removeCartItem, updateCartItemQty } from './cart.service.js';
import { telegramShopAuth } from './shop-auth.js';
import { sendCodedError } from './http-errors.js';
import { CART_ERROR_STATUS, SHOP_READ_ERROR_STATUS } from './errors.js';


export default async function shopApiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', telegramShopAuth);

  fastify.get('/shop/catalog', async (request) => {
    const data = await getShopCatalog(request.customer!.tenantId);
    return { success: true, data };
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

  fastify.post('/shop/cart/items', async (request, reply) => {
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

  fastify.patch('/shop/cart/items/:id', async (request, reply) => {
    try {
      const { id } = itemIdParamsSchema.parse(request.params);
      const { qty } = cartUpdateQtySchema.parse(request.body);
      const result = await updateCartItemQty({
        customerId: request.customer!.id,
        itemId: id,
        qty,
      });

      return { success: true, message: result.message };
    } catch (err: unknown) {
      return sendCodedError(reply, err, CART_ERROR_STATUS);
    }
  });

  fastify.delete('/shop/cart/items/:id', async (request, reply) => {
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

  fastify.post('/shop/checkout', async (request, reply) => {
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

  fastify.get('/shop/loyalty', async (request) => {
    const data = await getCustomerLoyalty(request.customer!.id, request.customer!.tenantId);
    return { success: true, data };
  });
}


