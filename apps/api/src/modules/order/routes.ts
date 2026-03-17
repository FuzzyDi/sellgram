import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { notifyOrderStatus, notifyPaymentPaid } from '../../bot/bot-manager.js';
import { applyOrderPaymentStatus } from '../../payments/service.js';
import { updateOrderStatus } from './order.service.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { writeAuditLog } from '../../lib/audit.js';

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

const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED']).optional(),
  storeId: z.string().optional(),
  paymentStatus: z.enum(['PENDING', 'PAID', 'REFUNDED']).optional(),
  search: z.string().max(200).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const updateDeliverySchema = z.object({
  deliveryPrice: z.number().min(0).optional(),
  trackingNumber: z.string().max(100).nullable().optional(),
});

export default async function orderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/orders', async (request, reply) => {
    let query: z.infer<typeof listOrdersQuerySchema>;
    try {
      query = listOrdersQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const { page: pageNum, pageSize: pageSizeNum, status, storeId, paymentStatus, search, dateFrom, dateTo } = query;
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = { tenantId: request.tenantId! };
    if (status) where.status = status;
    if (storeId) where.storeId = storeId;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

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
      data: { items, total, page: pageNum, pageSize: pageSizeNum, totalPages: Math.ceil(total / pageSizeNum)  },
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

    // Resolve changedBy userId → user name
    const actorIds = [...new Set(order.statusHistory.map((h) => h.changedBy).filter((id): id is string => !!id))];
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
      : [];
    const actorMap = Object.fromEntries(actors.map((a) => [a.id, a]));

    return {
      success: true,
      data: {
        ...order,
        statusHistory: order.statusHistory.map((h) => ({
          ...h,
          actor: h.changedBy ? (actorMap[h.changedBy] ?? null) : null,
        })),
      },
    };
  });

  fastify.patch(
    '/orders/:id/status',
    { preHandler: [permissionGuard('manageOrders')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let body: z.infer<typeof updateStatusSchema>;
      try {
        body = updateStatusSchema.parse(request.body);
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
      }

      try {
        const result = await updateOrderStatus({
          orderId: id,
          tenantId: request.tenantId!,
          actorUserId: request.user!.userId,
          status: body.status,
          note: body.note,
          cancelReason: body.cancelReason,
          trackingNumber: body.trackingNumber,
          deliveryPrice: body.deliveryPrice,
        });

        notifyOrderStatus(result.storeId, id, body.status).catch(() => {});
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
        if (err.message === 'ORDER_CONCURRENT_MODIFICATION') {
          return reply.status(409).send({ success: false, error: 'Order was modified concurrently. Please refresh and try again.' });
        }
        return reply.status(400).send({ success: false, error: err.message });
      }
    }
  );

  fastify.patch('/orders/:id/delivery', { preHandler: [permissionGuard('manageOrders')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let deliveryBody: z.infer<typeof updateDeliverySchema>;
    try {
      deliveryBody = updateDeliverySchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const { deliveryPrice, trackingNumber } = deliveryBody;

    const result = await prisma.order.updateMany({
      where: { id, tenantId: request.tenantId! },
      data: { deliveryPrice, trackingNumber },
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Order not found' });
    writeAuditLog({ tenantId: request.tenantId!, actorId: request.user?.userId, action: 'order.delivery.update', targetId: id, details: Object.fromEntries(Object.entries(deliveryBody).filter(([, v]) => v !== undefined)) as Record<string, unknown> });
    return { success: true, message: 'Delivery info updated' };
  });

  fastify.patch('/orders/:id/payment', { preHandler: [permissionGuard('manageOrders')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let body: z.infer<typeof updatePaymentSchema>;
    try {
      body = updatePaymentSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    try {
      const updatedOrder = await applyOrderPaymentStatus(prisma, {
        orderId: id,
        tenantId: request.tenantId!,
        status: body.paymentStatus,
      });
      if (body.paymentStatus === 'PAID') {
        notifyPaymentPaid(updatedOrder.storeId, updatedOrder.id).catch(() => {});
      }
      writeAuditLog({ tenantId: request.tenantId!, actorId: request.user?.userId, action: 'order.payment.update', targetId: id, details: { paymentStatus: body.paymentStatus } });
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

  const listReviewsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    storeId: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  });

  fastify.get('/reviews', async (request, reply) => {
    let query: z.infer<typeof listReviewsQuerySchema>;
    try {
      query = listReviewsQuerySchema.parse(request.query);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const { page: pageNum, pageSize: pageSizeNum, rating, storeId, dateFrom, dateTo } = query;
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = { tenantId: request.tenantId! };
    if (rating) where.rating = rating;
    if (storeId) where.order = { storeId };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [items, total, aggregate, distribution] = await Promise.all([
      prisma.orderReview.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              storeId: true,
              store: { select: { name: true } },
              customer: { select: { id: true, firstName: true, lastName: true, telegramUser: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      prisma.orderReview.count({ where }),
      prisma.orderReview.aggregate({ where, _avg: { rating: true } }),
      prisma.orderReview.groupBy({ by: ['rating'], where, _count: { rating: true } }),
    ]);

    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distribution) dist[row.rating] = row._count.rating;

    return {
      success: true,
      data: {
        items,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
        stats: {
          avg: aggregate._avg.rating ? Math.round(aggregate._avg.rating * 10) / 10 : null,
          distribution: dist,
        },
      },
    };
  });
}
