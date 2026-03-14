import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { canTransition } from '@sellgram/shared';
import { notifyOrderStatus } from '../../bot/bot-manager.js';
import { applyOrderPaymentStatus } from '../../payments/service.js';

const updateStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED']),
  note: z.string().optional(),
  cancelReason: z.string().optional(),
  trackingNumber: z.string().optional(),
  deliveryPrice: z.number().optional(),
});

const updatePaymentSchema = z.object({
  paymentStatus: z.enum(['PENDING', 'PAID', 'REFUNDED']),
});

export default async function orderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/orders', async (request) => {
    const { page = 1, pageSize = 20, status, storeId, paymentStatus, search } = request.query as any;
    const pageNum = Number(page);
    const pageSizeNum = Number(pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = { tenantId: request.tenantId! };
    if (status) where.status = status;
    if (storeId) where.storeId = storeId;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    if (search?.trim()) {
      const q = search.trim();
      const parsedNumber = Number(q);
      const orFilters: any[] = [
        { customer: { firstName: { contains: q, mode: 'insensitive' } } },
        { customer: { lastName: { contains: q, mode: 'insensitive' } } },
        { customer: { telegramUser: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
        { note: { contains: q, mode: 'insensitive' } },
        { trackingNumber: { contains: q, mode: 'insensitive' } },
      ];
      if (!Number.isNaN(parsedNumber)) {
        orFilters.push({ orderNumber: parsedNumber });
      }
      where.OR = orFilters;
    }

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, telegramUser: true, phone: true } },
          store: { select: { id: true, name: true } },
          items: true,
          deliveryZone: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      success: true,
      data: { items, total, page: pageNum, pageSize: pageSizeNum, totalPages: Math.ceil(total / pageSizeNum) },
    };
  });

  fastify.get('/orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = await prisma.order.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: {
        customer: true,
        store: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        deliveryZone: true,
      },
    });
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' });
    return { success: true, data: order };
  });

  fastify.patch('/orders/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateStatusSchema.parse(request.body);

    try {
      const txResult = await prisma.$transaction(async (tx: any) => {
        const order = await tx.order.findFirst({
          where: { id, tenantId: request.tenantId! },
          include: { items: true, customer: true },
        });
        if (!order) {
          throw new Error('ORDER_NOT_FOUND');
        }

        if (!canTransition(order.status, body.status)) {
          throw new Error(`BAD_TRANSITION:${order.status}:${body.status}`);
        }

        if (body.status === 'CONFIRMED') {
          for (const item of order.items) {
            if (item.variantId) {
              const variant = await tx.productVariant.findFirst({
                where: {
                  id: item.variantId,
                  product: { tenantId: request.tenantId! },
                },
              });
              if (!variant || variant.stockQty < item.qty) {
                throw new Error(`INSUFFICIENT_STOCK:${item.name}`);
              }
              await tx.productVariant.update({
                where: { id: item.variantId },
                data: { stockQty: { decrement: item.qty } },
              });
            } else {
              const product = await tx.product.findFirst({
                where: { id: item.productId, tenantId: request.tenantId! },
              });
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

        if (body.status === 'CANCELLED' && ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status)) {
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
                tenantId: request.tenantId!,
                type: 'ADJUST',
                points: order.loyaltyPointsUsed,
                balanceAfter: order.customer.loyaltyPoints + order.loyaltyPointsUsed,
                orderId: order.id,
                description: 'Loyalty points returned: order cancelled',
              },
            });
          }
        }

        if (body.status === 'COMPLETED') {
          const loyaltyConfig = await tx.loyaltyConfig.findUnique({ where: { tenantId: request.tenantId! } });
          if (loyaltyConfig?.isEnabled) {
            const pointsEarned = Math.floor(Number(order.total) / loyaltyConfig.unitAmount) * loyaltyConfig.pointsPerUnit;
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
                  tenantId: request.tenantId!,
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

        const updateData: any = { status: body.status };
        if (body.cancelReason) updateData.cancelReason = body.cancelReason;
        if (body.trackingNumber) updateData.trackingNumber = body.trackingNumber;
        if (body.deliveryPrice !== undefined) updateData.deliveryPrice = body.deliveryPrice;
        if (body.status === 'COMPLETED') updateData.paymentStatus = 'PAID';

        await tx.order.update({ where: { id }, data: updateData });
        await tx.orderStatusLog.create({
          data: {
            orderId: id,
            fromStatus: order.status,
            toStatus: body.status,
            changedBy: request.user!.userId,
            note: body.note,
          },
        });

        return { storeId: order.storeId };
      });

      notifyOrderStatus(txResult.storeId, id, body.status).catch(() => {});
      return { success: true, message: `Order status updated to ${body.status}` };
    } catch (err: any) {
      if (err.message === 'ORDER_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Order not found' });
      }
      if (err.message.startsWith('BAD_TRANSITION:')) {
        const [, from, to] = err.message.split(':');
        return reply.status(400).send({ success: false, error: `Cannot transition from ${from} to ${to}` });
      }
      if (err.message.startsWith('INSUFFICIENT_STOCK:')) {
        const [, itemName] = err.message.split(':');
        return reply.status(400).send({ success: false, error: `Not enough stock for ${itemName}` });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/orders/:id/delivery', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { deliveryPrice, trackingNumber } = request.body as any;

    const result = await prisma.order.updateMany({
      where: { id, tenantId: request.tenantId! },
      data: { deliveryPrice, trackingNumber },
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Order not found' });
    return { success: true, message: 'Delivery info updated' };
  });

  fastify.patch('/orders/:id/payment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updatePaymentSchema.parse(request.body);

    try {
      await applyOrderPaymentStatus(prisma, {
        orderId: id,
        tenantId: request.tenantId!,
        status: body.paymentStatus,
      });
      return { success: true, message: 'Payment status updated' };
    } catch (err: any) {
      if (err.message === 'ORDER_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Order not found' });
      }
      if (err.message.startsWith('BAD_PAYMENT_TRANSITION:')) {
        const [, from, to] = err.message.split(':');
        return reply.status(400).send({ success: false, error: `Cannot change payment status from ${from} to ${to}` });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
}
