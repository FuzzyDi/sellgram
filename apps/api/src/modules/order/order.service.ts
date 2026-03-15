import prisma from '../../lib/prisma.js';
import { canTransition } from '@sellgram/shared';

export async function updateOrderStatus(input: {
  orderId: string;
  tenantId: string;
  actorUserId: string;
  status: string;
  note?: string;
  cancelReason?: string;
  trackingNumber?: string;
  deliveryPrice?: number;
}): Promise<{ storeId: string }> {
  return prisma.$transaction(async (tx: any) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, tenantId: input.tenantId },
      include: { items: true, customer: true },
    });
    if (!order) throw new Error('ORDER_NOT_FOUND');

    if (!canTransition(order.status, input.status)) {
      throw new Error(`BAD_TRANSITION:${order.status}:${input.status}`);
    }

    if (input.status === 'CONFIRMED') {
      const itemsWithVariant = order.items.filter((i: any) => i.variantId);
      const itemsWithoutVariant = order.items.filter((i: any) => !i.variantId);

      const [variantRows, productRows] = await Promise.all([
        itemsWithVariant.length > 0
          ? tx.productVariant.findMany({
              where: {
                id: { in: itemsWithVariant.map((i: any) => i.variantId) },
                product: { tenantId: input.tenantId },
              },
            })
          : Promise.resolve([] as any[]),
        itemsWithoutVariant.length > 0
          ? tx.product.findMany({
              where: {
                id: { in: itemsWithoutVariant.map((i: any) => i.productId) },
                tenantId: input.tenantId,
              },
            })
          : Promise.resolve([] as any[]),
      ]);

      const variantMap = new Map<string, any>(variantRows.map((v: any) => [v.id, v]));
      const productMap = new Map<string, any>(productRows.map((p: any) => [p.id, p]));

      for (const item of order.items) {
        if (item.variantId) {
          const variant = variantMap.get(item.variantId);
          if (!variant || variant.stockQty < item.qty) {
            throw new Error(`INSUFFICIENT_STOCK:${item.name}`);
          }
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQty: { decrement: item.qty } },
          });
        } else {
          const product = productMap.get(item.productId);
          if (!product || product.stockQty < item.qty) {
            throw new Error(`INSUFFICIENT_STOCK:${item.name}`);
          }
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { decrement: item.qty } },
          });
        }
      }
    }

    if (input.status === 'CANCELLED' && ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status)) {
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQty: { increment: item.qty } },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { increment: item.qty } },
          });
        }
      }

      if (order.loyaltyPointsUsed > 0) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: { loyaltyPoints: { increment: order.loyaltyPointsUsed } },
        });
        await tx.loyaltyTransaction.create({
          data: {
            customerId: order.customerId,
            tenantId: input.tenantId,
            type: 'ADJUST',
            points: order.loyaltyPointsUsed,
            balanceAfter: order.customer.loyaltyPoints + order.loyaltyPointsUsed,
            orderId: order.id,
            description: 'Loyalty points returned: order cancelled',
          },
        });
      }
    }

    if (input.status === 'COMPLETED') {
      const loyaltyConfig = await tx.loyaltyConfig.findUnique({ where: { tenantId: input.tenantId } });
      if (loyaltyConfig?.isEnabled) {
        const pointsEarned =
          Math.floor(Number(order.total) / loyaltyConfig.unitAmount) * loyaltyConfig.pointsPerUnit;
        if (pointsEarned > 0) {
          const customer = await tx.customer.update({
            where: { id: order.customerId },
            data: {
              loyaltyPoints: { increment: pointsEarned },
              totalSpent: { increment: order.total },
              ordersCount: { increment: 1 },
            },
          });
          await tx.loyaltyTransaction.create({
            data: {
              customerId: order.customerId,
              tenantId: input.tenantId,
              type: 'EARN',
              points: pointsEarned,
              balanceAfter: customer.loyaltyPoints,
              orderId: order.id,
              description: 'Loyalty points earned for order #' + order.orderNumber,
            },
          });
        }
      }
    }

    const updateData: any = { status: input.status };
    if (input.cancelReason) updateData.cancelReason = input.cancelReason;
    if (input.trackingNumber) updateData.trackingNumber = input.trackingNumber;
    if (input.deliveryPrice !== undefined) updateData.deliveryPrice = input.deliveryPrice;
    if (input.status === 'COMPLETED') updateData.paymentStatus = 'PAID';

    // Guard against concurrent status changes (e.g. bot timer and HTTP route both
    // completing the same DELIVERED order). If another process already changed the
    // status, this update matches 0 rows and we abort — preventing double loyalty award.
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: updateData,
    });
    if (updated.count === 0) throw new Error('ORDER_CONCURRENT_MODIFICATION');
    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: input.status,
        changedBy: input.actorUserId,
        note: input.note,
      },
    });

    return { storeId: order.storeId };
  });
}
