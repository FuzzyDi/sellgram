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
  refundAmount?: number;
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

    // Stock was already decremented at checkout (NEW). On cancel from any
    // pre-fulfillment status, restore it and log the movement.
    if (input.status === 'CANCELLED' && ['NEW', 'CONFIRMED', 'PREPARING', 'READY'].includes(order.status)) {
      for (const item of order.items) {
        if (item.variantId) {
          const updated = await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQty: { increment: item.qty } },
            select: { stockQty: true },
          });
          await tx.stockMovement.create({
            data: {
              tenantId: input.tenantId,
              productId: item.productId,
              variantId: item.variantId,
              delta: item.qty,
              qtyBefore: updated.stockQty - item.qty,
              qtyAfter: updated.stockQty,
              note: `Order #${order.orderNumber} cancelled`,
              userId: input.actorUserId,
            },
          });
        } else {
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { increment: item.qty } },
            select: { stockQty: true },
          });
          await tx.stockMovement.create({
            data: {
              tenantId: input.tenantId,
              productId: item.productId,
              delta: item.qty,
              qtyBefore: updated.stockQty - item.qty,
              qtyAfter: updated.stockQty,
              note: `Order #${order.orderNumber} cancelled`,
              userId: input.actorUserId,
            },
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
    if (input.status === 'REFUNDED') {
      updateData.paymentStatus = 'REFUNDED';
      if (input.refundAmount !== undefined) updateData.refundAmount = input.refundAmount;
    }

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
