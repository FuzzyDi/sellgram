import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { validateInitData, type TelegramUser } from '../../lib/telegram-auth.js';
import { decrypt } from '../../lib/encrypt.js';
import { getConfig } from '../../config/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    telegramUser?: TelegramUser;
    customer?: { id: string; tenantId: string };
    storeId?: string;
  }
}

async function telegramAuth(request: FastifyRequest, reply: FastifyReply) {
  const initData = request.headers['x-telegram-init-data'] as string;
  const storeId = request.headers['x-store-id'] as string;

  if (!storeId) {
    return reply.status(401).send({ success: false, error: 'Missing store ID' });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || !store.isActive) {
    return reply.status(404).send({ success: false, error: 'Store not found' });
  }

  request.storeId = storeId;

  if (initData) {
    const botToken = decrypt(store.botToken);
    const tgUser = validateInitData(initData, botToken, getConfig().MINIAPP_INITDATA_MAX_AGE_SEC);
    if (tgUser) {
      request.telegramUser = tgUser;

      let customer = await prisma.customer.findUnique({
        where: { tenantId_telegramId: { tenantId: store.tenantId, telegramId: BigInt(tgUser.id) } },
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            tenantId: store.tenantId,
            telegramId: BigInt(tgUser.id),
            telegramUser: tgUser.username,
            firstName: tgUser.first_name,
            lastName: tgUser.last_name,
          },
        });
      }

      request.customer = { id: customer.id, tenantId: store.tenantId };
      return;
    }
  }

  const cfg = getConfig();
  if (process.env.NODE_ENV !== 'production' && cfg.ALLOW_DEV_AUTH_BYPASS) {
    const firstCustomer = await prisma.customer.findFirst({ where: { tenantId: store.tenantId } });
    if (firstCustomer) {
      request.customer = { id: firstCustomer.id, tenantId: store.tenantId };
      return;
    }
  }

  return reply.status(401).send({ success: false, error: 'Auth failed' });
}

const checkoutSchema = z.object({
  deliveryType: z.enum(['PICKUP', 'LOCAL', 'NATIONAL']),
  deliveryZoneId: z.string().optional(),
  deliveryAddress: z.string().optional(),
  loyaltyPointsToUse: z.number().int().min(0).default(0),
  note: z.string().optional(),
  contactPhone: z.string().optional(),
  paymentMethodId: z.string().optional(),
});

export default async function shopApiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', telegramAuth);

  fastify.get('/shop/catalog', async (request) => {
    const tenantId = request.customer!.tenantId;

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

    return { success: true, data: { categories, products } };
  });

  fastify.get('/shop/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, tenantId: request.customer!.tenantId, isActive: true },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true } },
        category: { select: { id: true, name: true } },
      },
    });
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });
    return { success: true, data: product };
  });

  fastify.get('/shop/cart', async (request) => {
    const items = await prisma.cartItem.findMany({
      where: { customerId: request.customer!.id, storeId: request.storeId! },
    });

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
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
    return { success: true, data: { items: enrichedItems, subtotal } };
  });

  fastify.post('/shop/cart/items', async (request, reply) => {
    const body = request.body as any;
    const productId = String(body.productId || '');
    const variantId = body.variantId ? String(body.variantId) : null;
    const qty = Number(body.qty ?? 1);

    if (!productId || !Number.isInteger(qty) || qty <= 0 || qty > 100) {
      return reply.status(400).send({ success: false, error: 'Invalid quantity or product' });
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId: request.customer!.tenantId, isActive: true },
      include: { variants: true },
    });
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' });

    if (variantId) {
      const variant = product.variants.find((v) => v.id === variantId && v.isActive);
      if (!variant) {
        return reply.status(404).send({ success: false, error: 'Variant not found' });
      }
      if (variant.stockQty < qty) {
        return reply.status(400).send({ success: false, error: 'Not enough stock' });
      }
    } else if (product.stockQty < qty) {
      return reply.status(400).send({ success: false, error: 'Not enough stock' });
    }

    const existing = await prisma.cartItem.findFirst({
      where: {
        customerId: request.customer!.id,
        storeId: request.storeId!,
        productId,
        variantId: variantId || null,
      },
    });

    if (existing) {
      const newQty = existing.qty + qty;
      await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: newQty } });
    } else {
      await prisma.cartItem.create({
        data: {
          customerId: request.customer!.id,
          storeId: request.storeId!,
          productId,
          variantId,
          qty,
        },
      });
    }

    return { success: true, message: 'Added to cart' };
  });

  fastify.patch('/shop/cart/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const qty = Number((request.body as any).qty);
    if (!Number.isInteger(qty) || qty < 0 || qty > 100) {
      return reply.status(400).send({ success: false, error: 'Invalid quantity' });
    }

    const item = await prisma.cartItem.findFirst({ where: { id, customerId: request.customer!.id } });
    if (!item) return reply.status(404).send({ success: false, error: 'Item not found' });

    if (qty <= 0) {
      await prisma.cartItem.delete({ where: { id } });
      return { success: true, message: 'Item removed' };
    }

    await prisma.cartItem.update({ where: { id }, data: { qty } });
    return { success: true, message: 'Cart updated' };
  });

  fastify.delete('/shop/cart/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await prisma.cartItem.findFirst({ where: { id, customerId: request.customer!.id } });
    if (!item) return reply.status(404).send({ success: false, error: 'Item not found' });

    await prisma.cartItem.delete({ where: { id } });
    return { success: true, message: 'Item removed' };
  });

  fastify.get('/shop/delivery-zones', async (request) => {
    const zones = await prisma.deliveryZone.findMany({
      where: { storeId: request.storeId!, tenantId: request.customer!.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: zones };
  });

  fastify.get('/shop/payment-methods', async (request) => {
    const methods = await prisma.storePaymentMethod.findMany({
      where: {
        tenantId: request.customer!.tenantId,
        storeId: request.storeId!,
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

    return { success: true, data: methods };
  });

  fastify.post('/shop/checkout', async (request, reply) => {
    try {
      const body = checkoutSchema.parse(request.body);
      const customerId = request.customer!.id;
      const tenantId = request.customer!.tenantId;
      const storeId = request.storeId!;

      const cartItems = await prisma.cartItem.findMany({ where: { customerId, storeId } });
      if (cartItems.length === 0) {
        return reply.status(400).send({ success: false, error: 'Cart is empty' });
      }

      const orderItems: any[] = [];
      let subtotal = 0;

      for (const cartItem of cartItems) {
        const product = await prisma.product.findFirst({
          where: { id: cartItem.productId, tenantId, isActive: true },
          include: { variants: true },
        });
        if (!product) continue;

        const variant = cartItem.variantId ? product.variants.find((v) => v.id === cartItem.variantId && v.isActive) : null;
        const availableStock = variant ? variant.stockQty : product.stockQty;
        if (availableStock < cartItem.qty) {
          return reply.status(400).send({ success: false, error: `Not enough stock for ${product.name}` });
        }

        const price = Number(variant?.price ?? product.price);
        const itemTotal = price * cartItem.qty;

        orderItems.push({
          productId: product.id,
          variantId: cartItem.variantId,
          name: product.name,
          variantName: variant?.name,
          price,
          qty: cartItem.qty,
          total: itemTotal,
        });

        subtotal += itemTotal;
      }

      if (orderItems.length === 0) {
        return reply.status(400).send({ success: false, error: 'No available items in cart' });
      }

      let deliveryPrice = 0;
      if (body.deliveryType === 'LOCAL' && body.deliveryZoneId) {
        const zone = await prisma.deliveryZone.findFirst({
          where: {
            id: body.deliveryZoneId,
            tenantId,
            storeId,
            isActive: true,
          },
        });
        if (!zone) {
          return reply.status(400).send({ success: false, error: 'Delivery zone not found' });
        }

        deliveryPrice = zone.freeFrom && subtotal >= Number(zone.freeFrom) ? 0 : Number(zone.price);
      }

      const paymentMethod = body.paymentMethodId
        ? await prisma.storePaymentMethod.findFirst({
            where: {
              id: body.paymentMethodId,
              tenantId,
              storeId,
              isActive: true,
            },
          })
        : await prisma.storePaymentMethod.findFirst({
            where: { tenantId, storeId, isActive: true, isDefault: true },
            orderBy: { sortOrder: 'asc' },
          });

      if (!paymentMethod) {
        return reply.status(400).send({ success: false, error: 'Payment method unavailable' });
      }

      let loyaltyDiscount = 0;
      let loyaltyPointsUsed = 0;
      if (body.loyaltyPointsToUse > 0) {
        const loyaltyConfig = await prisma.loyaltyConfig.findUnique({ where: { tenantId } });
        const customer = await prisma.customer.findUnique({ where: { id: customerId } });

        if (loyaltyConfig?.isEnabled && customer) {
          const maxDiscount = Math.floor((subtotal * loyaltyConfig.maxDiscountPct) / 100);
          const maxPointsByDiscount = Math.floor(maxDiscount / loyaltyConfig.pointValue);
          loyaltyPointsUsed = Math.min(body.loyaltyPointsToUse, customer.loyaltyPoints, maxPointsByDiscount);
          if (loyaltyPointsUsed >= loyaltyConfig.minPointsToRedeem) {
            loyaltyDiscount = loyaltyPointsUsed * loyaltyConfig.pointValue;
          } else {
            loyaltyPointsUsed = 0;
          }
        }
      }

      const total = subtotal + deliveryPrice - loyaltyDiscount;

      const order = await prisma.$transaction(async (tx) => {
        const lastOrder = await tx.order.findFirst({ where: { tenantId }, orderBy: { orderNumber: 'desc' } });
        const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

        const newOrder = await tx.order.create({
          data: {
            tenantId,
            storeId,
            orderNumber,
            customerId,
            deliveryType: body.deliveryType,
            deliveryZoneId: body.deliveryZoneId,
            deliveryAddress: body.deliveryAddress,
            deliveryPrice,
            subtotal,
            loyaltyDiscount,
            loyaltyPointsUsed,
            total,
            note: body.note,
            paymentMethod: 'CASH_ON_DELIVERY',
            paymentMethodId: paymentMethod.id,
            paymentMethodCode: paymentMethod.code,
            paymentMethodTitle: paymentMethod.title,
            paymentMeta: paymentMethod.meta || undefined,
            items: { create: orderItems },
          },
          include: { items: true, customer: true },
        });

        if (body.contactPhone) {
          await tx.customer.update({ where: { id: customerId }, data: { phone: body.contactPhone } });
        }

        await tx.orderStatusLog.create({
          data: { orderId: newOrder.id, toStatus: 'NEW', changedBy: 'customer' },
        });

        if (loyaltyPointsUsed > 0) {
          const customer = await tx.customer.update({
            where: { id: customerId },
            data: { loyaltyPoints: { decrement: loyaltyPointsUsed } },
          });

          await tx.loyaltyTransaction.create({
            data: {
              customerId,
              tenantId,
              type: 'REDEEM',
              points: -loyaltyPointsUsed,
              balanceAfter: customer.loyaltyPoints,
              orderId: newOrder.id,
              description: `Списание за заказ #${orderNumber}`,
            },
          });
        }

        await tx.cartItem.deleteMany({ where: { customerId, storeId } });
        return newOrder;
      });

      try {
        const { notifyNewOrder } = await import('../../bot/bot-manager.js');
        notifyNewOrder(storeId, { ...order, contactPhone: body.contactPhone }).catch(() => {});
      } catch {}

      return { success: true, data: order };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/shop/orders', async (request) => {
    const orders = await prisma.order.findMany({
      where: { customerId: request.customer!.id },
      include: {
        items: true,
        store: { select: { name: true } },
        deliveryZone: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { success: true, data: orders };
  });

  fastify.get('/shop/orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = await prisma.order.findFirst({
      where: { id, customerId: request.customer!.id },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
        deliveryZone: true,
        store: { select: { name: true } },
      },
    });
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' });
    return { success: true, data: order };
  });

  fastify.get('/shop/loyalty', async (request) => {
    const customer = await prisma.customer.findUnique({ where: { id: request.customer!.id }, select: { loyaltyPoints: true } });
    const config = await prisma.loyaltyConfig.findUnique({ where: { tenantId: request.customer!.tenantId } });

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { customerId: request.customer!.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      success: true,
      data: {
        balance: customer?.loyaltyPoints ?? 0,
        config: config ? { pointValue: config.pointValue, unitAmount: config.unitAmount, isEnabled: config.isEnabled } : null,
        transactions,
      },
    };
  });
}
