import prisma from '../../lib/prisma.js';
import { prepareOrderPayment } from '../../payments/service.js';
import type { CheckoutInput } from './dto.js';

export async function createShopCheckoutOrder(input: {
  customerId: string;
  tenantId: string;
  storeId: string;
  body: CheckoutInput;
}) {
  const { customerId, tenantId, storeId, body } = input;

  const cartItems = await prisma.cartItem.findMany({ where: { customerId, storeId } });
  if (cartItems.length === 0) {
    throw new Error('Cart is empty');
  }

  const productIds = [...new Set(cartItems.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId, isActive: true },
    include: { variants: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const orderItems: any[] = [];
  let subtotal = 0;

  for (const cartItem of cartItems) {
    const product = productMap.get(cartItem.productId);
    if (!product) continue;

    const variant = cartItem.variantId ? product.variants.find((v: any) => v.id === cartItem.variantId && v.isActive) : null;
    const availableStock = variant ? variant.stockQty : product.stockQty;
    if (availableStock < cartItem.qty) {
      throw new Error(`Not enough stock for ${product.name}`);
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
    throw new Error('No available items in cart');
  }

  let deliveryPrice = 0;
  let validatedDeliveryZoneId: string | null = null;
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
      throw new Error('Delivery zone not found');
    }

    validatedDeliveryZoneId = zone.id;
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
    throw new Error('Payment method unavailable');
  }

  const order = await prisma.$transaction(async (tx: any) => {
    // Advisory lock scoped per tenant — prevents concurrent checkouts from
    // racing on orderNumber and loyalty balance. Released automatically when
    // the transaction ends.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;

    // Re-validate stock inside the lock so two concurrent checkouts cannot
    // both pass the pre-transaction check and oversell the same item.
    const freshProducts = await tx.product.findMany({
      where: { id: { in: orderItems.map((i) => i.productId) } },
      include: { variants: true },
    });
    const freshMap = new Map<string, any>(freshProducts.map((p: any) => [p.id, p]));
    for (const item of orderItems) {
      const fp: any = freshMap.get(item.productId);
      if (!fp) throw new Error(`Product not found: ${item.name}`);
      const fv = item.variantId ? fp.variants.find((v: any) => v.id === item.variantId && v.isActive) : null;
      const stock = fv ? fv.stockQty : fp.stockQty;
      if (stock < item.qty) throw new Error(`Not enough stock for ${item.name}`);
    }

    const lastOrder = await tx.order.findFirst({ where: { tenantId }, orderBy: { orderNumber: 'desc' } });
    const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

    // Loyalty calculation happens inside the lock so the balance read is
    // consistent with the decrement that follows (prevents negative balances).
    let loyaltyDiscount = 0;
    let loyaltyPointsUsed = 0;
    if (body.loyaltyPointsToUse > 0) {
      const loyaltyConfig = await tx.loyaltyConfig.findUnique({ where: { tenantId } });
      const customer = await tx.customer.findUnique({ where: { id: customerId } });

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

    const preparedPayment = prepareOrderPayment({
      method: {
        provider: paymentMethod.provider as any,
        code: paymentMethod.code,
        title: paymentMethod.title,
        description: paymentMethod.description,
        instructions: paymentMethod.instructions,
        meta: (paymentMethod.meta as any) || undefined,
      },
      tenantId,
      storeId,
      customerId,
      orderNumber,
      totalAmount: total,
      currency: 'UZS',
    });

    const newOrder = await tx.order.create({
      data: {
        tenantId,
        storeId,
        orderNumber,
        customerId,
        deliveryType: body.deliveryType,
        deliveryZoneId: validatedDeliveryZoneId,
        deliveryAddress: body.deliveryAddress,
        deliveryPrice,
        subtotal,
        loyaltyDiscount,
        loyaltyPointsUsed,
        total,
        note: body.note,
        paymentMethod: preparedPayment.paymentMethod as any,
        paymentMethodId: paymentMethod.id,
        paymentMethodCode: paymentMethod.code,
        paymentMethodTitle: paymentMethod.title,
        paymentMeta: preparedPayment.paymentMeta || (paymentMethod.meta as any) || undefined,
        paymentStatus: preparedPayment.paymentStatus as any,
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
          description: `Loyalty points redeemed for order #${orderNumber}`,
        },
      });
    }

    await tx.cartItem.deleteMany({ where: { customerId, storeId } });
    return newOrder;
  });

  return order;
}