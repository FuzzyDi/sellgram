import { FastifyInstance } from 'fastify';
import prisma from '../../lib/prisma.js';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // Dashboard summary
  fastify.get('/analytics/dashboard', async (request) => {
    const tenantId = request.tenantId!;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalOrders,
      todayOrders,
      weekOrders,
      completedOrders,
      todayRevenue,
      weekRevenue,
      monthRevenue,
      totalCustomers,
      totalProducts,
      newCustomersWeek,
      pendingOrders,
    ] = await Promise.all([
      prisma.order.count({ where: { tenantId } }),
      prisma.order.count({ where: { tenantId, createdAt: { gte: today } } }),
      prisma.order.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      prisma.order.count({ where: { tenantId, status: 'COMPLETED' } }),
      prisma.order.aggregate({
        where: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: today } },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: weekAgo } },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: monthAgo } },
        _sum: { total: true },
        _avg: { total: true },
      }),
      prisma.customer.count({ where: { tenantId } }),
      prisma.product.count({ where: { tenantId, isActive: true } }),
      prisma.customer.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      prisma.order.count({ where: { tenantId, status: 'NEW' } }),
    ]);

    // Repeat customers
    const repeatCustomers = await prisma.customer.count({
      where: { tenantId, ordersCount: { gt: 1 } },
    });

    return {
      success: true,
      data: {
        orders: { total: totalOrders, today: todayOrders, week: weekOrders, completed: completedOrders, pending: pendingOrders },
        revenue: {
          today: Number(todayRevenue._sum.total) || 0,
          week: Number(weekRevenue._sum.total) || 0,
          month: Number(monthRevenue._sum.total) || 0,
          avgCheck: Math.round(Number(monthRevenue._avg.total) || 0),
        },
        customers: {
          total: totalCustomers,
          newThisWeek: newCustomersWeek,
          repeatRate: totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0,
        },
        products: {
          total: totalProducts,
        },
      },
    };
  });

  // Top products
  fastify.get('/analytics/top-products', async (request) => {
    const { limit = 10, period = '30' } = request.query as any;
    const since = new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000);

    const topProducts = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          tenantId: request.tenantId!,
          status: { in: ['COMPLETED', 'DELIVERED'] },
          createdAt: { gte: since },
        },
      },
      _sum: { qty: true, total: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: Number(limit),
    });

    // Fetch product details
    const productIds = topProducts.map((p: any) => p.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true, stockQty: true },
    });

    const result = topProducts.map((tp: any) => {
      const product = products.find((p: any) => p.id === tp.productId);
      return {
        product,
        totalQty: tp._sum.qty,
        totalRevenue: Number(tp._sum.total),
      };
    });

    return { success: true, data: result };
  });

  // Revenue time series
  fastify.get('/analytics/revenue', async (request) => {
    const { days = 30 } = request.query as any;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    // Use raw query for daily grouping
    const orders = await prisma.order.findMany({
      where: {
        tenantId: request.tenantId!,
        status: { in: ['COMPLETED', 'DELIVERED'] },
        createdAt: { gte: since },
      },
      select: { total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const byDate: Record<string, { revenue: number; count: number }> = {};
    for (const order of orders) {
      const date = order.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { revenue: 0, count: 0 };
      byDate[date].revenue += Number(order.total);
      byDate[date].count += 1;
    }

    const series = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    return { success: true, data: series };
  });
}
