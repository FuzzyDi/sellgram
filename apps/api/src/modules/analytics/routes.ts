import { FastifyInstance } from 'fastify';
import prisma from '../../lib/prisma.js';
import { PLANS, type PlanCode, type ReportsLevel } from '@sellgram/shared';

const REPORTS_LEVEL_WEIGHT: Record<ReportsLevel, number> = {
  BASIC: 1,
  ADVANCED: 2,
  FULL: 3,
};

type ReportLimits = {
  planCode: string;
  reportsLevel: ReportsLevel;
  reportsHistoryDays: number;
  allowReportExport: boolean;
  maxReportsPerMonth: number;
  maxScheduledReports: number;
};

function hasReportsLevel(current: ReportsLevel, required: ReportsLevel) {
  return REPORTS_LEVEL_WEIGHT[current] >= REPORTS_LEVEL_WEIGHT[required];
}

function clampDays(raw: unknown, maxDays: number, fallback: number) {
  const val = Number(raw);
  if (!Number.isFinite(val) || val <= 0) return Math.min(fallback, maxDays);
  return Math.max(1, Math.min(Math.round(val), maxDays));
}

function getReportAccess(reportLimits: ReportLimits) {
  return {
    basic: hasReportsLevel(reportLimits.reportsLevel, 'BASIC'),
    advanced: hasReportsLevel(reportLimits.reportsLevel, 'ADVANCED'),
    full: hasReportsLevel(reportLimits.reportsLevel, 'FULL'),
    export: reportLimits.allowReportExport,
  };
}

async function getTenantReportLimits(tenantId: string): Promise<ReportLimits> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });

  const fallback = PLANS.FREE;
  const plan = tenant ? PLANS[tenant.plan as PlanCode] || fallback : fallback;
  return {
    planCode: plan.code,
    reportsLevel: plan.limits.reportsLevel,
    reportsHistoryDays: plan.limits.reportsHistoryDays,
    allowReportExport: plan.limits.allowReportExport,
    maxReportsPerMonth: plan.limits.maxReportsPerMonth,
    maxScheduledReports: plan.limits.maxScheduledReports,
  };
}

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/analytics/reports/meta', async (request) => {
    const reportLimits = await getTenantReportLimits(request.tenantId!);
    return {
      success: true,
      data: {
        reportLimits,
        reportAccess: getReportAccess(reportLimits),
        availableReports: [
          { code: 'top-products', level: 'BASIC' },
          { code: 'dashboard-summary', level: 'BASIC' },
          { code: 'revenue-series', level: 'ADVANCED' },
          { code: 'sales-by-category', level: 'ADVANCED' },
          { code: 'customers-value', level: 'FULL' },
        ],
      },
    };
  });

  // Dashboard summary
  fastify.get('/analytics/dashboard', async (request, reply) => {
    const tenantId = request.tenantId!;
    const reportLimits = await getTenantReportLimits(tenantId);

    if (!hasReportsLevel(reportLimits.reportsLevel, 'BASIC')) {
      return reply.status(402).send({
        success: false,
        error: 'Reports are not available on your current plan. Please upgrade.',
      });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrders,
      todayOrders,
      weekOrders,
      completedOrders,
      todayRevenue,
      weekRevenue,
      monthRevenue,
      totalCustomers,
      customersFromOrders,
      totalProducts,
      newCustomersWeek,
      pendingOrders,
      soldProductIds,
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
        where: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: monthStart } },
        _sum: { total: true },
        _avg: { total: true },
      }),
      prisma.customer.count({ where: { tenantId } }),
      prisma.order.findMany({
        where: { tenantId },
        distinct: ['customerId'],
        select: { customerId: true },
      }),
      prisma.product.count({ where: { tenantId } }),
      prisma.customer.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      prisma.order.count({ where: { tenantId, status: 'NEW' } }),
      prisma.orderItem.findMany({
        where: {
          order: {
            tenantId,
            status: { in: ['COMPLETED', 'DELIVERED'] },
          },
        },
        distinct: ['productId'],
        select: { productId: true },
      }),
    ]);

    const repeatCustomers = await prisma.customer.count({
      where: { tenantId, ordersCount: { gt: 1 } },
    });

    const soldProductsCount = soldProductIds.length;
    const productsTotal = Math.max(totalProducts, soldProductsCount);

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
          total: Math.max(totalCustomers, customersFromOrders.length),
          fromOrders: customersFromOrders.length,
          newThisWeek: newCustomersWeek,
          repeatRate: totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0,
        },
        products: {
          total: productsTotal,
        },
      },
      reportLimits,
      reportAccess: getReportAccess(reportLimits),
    };
  });

  // Top products
  fastify.get('/analytics/top-products', async (request, reply) => {
    const reportLimits = await getTenantReportLimits(request.tenantId!);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'BASIC')) {
      return reply.status(402).send({
        success: false,
        error: 'Reports are not available on your current plan. Please upgrade.',
      });
    }

    const { limit = 10, period = '30' } = request.query as any;
    const safePeriod = clampDays(period, Number(reportLimits.reportsHistoryDays || 30), 30);
    const since = new Date(Date.now() - safePeriod * 24 * 60 * 60 * 1000);

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
      orderBy: { _sum: { total: 'desc' } },
      take: Number(limit),
    });

    const productIds = topProducts.map((p: any) => p.productId);
    const [products, names] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, price: true, stockQty: true },
      }),
      prisma.orderItem.findMany({
        where: { productId: { in: productIds } },
        distinct: ['productId'],
        select: { productId: true, name: true },
      }),
    ]);

    const result = topProducts.map((tp: any) => {
      const product = products.find((p: any) => p.id === tp.productId);
      const fallback = names.find((n: any) => n.productId === tp.productId);
      return {
        productId: tp.productId,
        product,
        productName: product?.name || fallback?.name || '-',
        totalQty: Number(tp._sum.qty) || 0,
        totalRevenue: Number(tp._sum.total) || 0,
      };
    });

    return { success: true, data: result, reportLimits, reportAccess: getReportAccess(reportLimits) };
  });

  // Revenue time series
  fastify.get('/analytics/revenue', async (request, reply) => {
    const reportLimits = await getTenantReportLimits(request.tenantId!);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'ADVANCED')) {
      return reply.status(402).send({
        success: false,
        error: 'Advanced reports are available on PRO/BUSINESS plans only.',
      });
    }

    const { days = 30 } = request.query as any;
    const safeDays = clampDays(days, Number(reportLimits.reportsHistoryDays || 30), 30);
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        tenantId: request.tenantId!,
        status: { in: ['COMPLETED', 'DELIVERED'] },
        createdAt: { gte: since },
      },
      select: { total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

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

    return { success: true, data: series, reportLimits, reportAccess: getReportAccess(reportLimits) };
  });

  // Sales by categories (ADVANCED)
  fastify.get('/analytics/report-categories', async (request, reply) => {
    const reportLimits = await getTenantReportLimits(request.tenantId!);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'ADVANCED')) {
      return reply.status(402).send({
        success: false,
        error: 'Advanced reports are available on PRO/BUSINESS plans only.',
      });
    }

    const { days = 30, limit = 20 } = request.query as any;
    const safeDays = clampDays(days, Number(reportLimits.reportsHistoryDays || 30), 30);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          tenantId: request.tenantId!,
          status: { in: ['COMPLETED', 'DELIVERED'] },
          createdAt: { gte: since },
        },
      },
      select: {
        qty: true,
        total: true,
        product: {
          select: {
            categoryId: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    const map = new Map<string, { categoryId: string | null; categoryName: string; totalQty: number; totalRevenue: number }>();
    for (const item of items) {
      const categoryId = item.product?.categoryId || null;
      const categoryName = item.product?.category?.name || 'Uncategorized';
      const key = categoryId || '__none__';
      const prev = map.get(key) || { categoryId, categoryName, totalQty: 0, totalRevenue: 0 };
      prev.totalQty += Number(item.qty) || 0;
      prev.totalRevenue += Number(item.total) || 0;
      map.set(key, prev);
    }

    const result = Array.from(map.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, safeLimit);

    return { success: true, data: result, reportLimits, reportAccess: getReportAccess(reportLimits) };
  });

  // Customers value report (FULL)
  fastify.get('/analytics/report-customers', async (request, reply) => {
    const reportLimits = await getTenantReportLimits(request.tenantId!);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'FULL')) {
      return reply.status(402).send({
        success: false,
        error: 'Full reports are available on BUSINESS plan only.',
      });
    }

    const { days = 90, limit = 30 } = request.query as any;
    const safeDays = clampDays(days, Number(reportLimits.reportsHistoryDays || 90), 90);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 200));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const customers = await prisma.customer.findMany({
      where: {
        tenantId: request.tenantId!,
        OR: [
          { createdAt: { gte: since } },
          {
            orders: {
              some: {
                createdAt: { gte: since },
                status: { in: ['COMPLETED', 'DELIVERED'] },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        telegramUser: true,
        ordersCount: true,
        totalSpent: true,
        loyaltyPoints: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ totalSpent: 'desc' }, { updatedAt: 'desc' }],
      take: safeLimit,
    });

    const result = customers.map((customer) => ({
      ...customer,
      totalSpent: Number(customer.totalSpent) || 0,
      displayName:
        [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || customer.telegramUser || customer.id,
    }));

    return { success: true, data: result, reportLimits, reportAccess: getReportAccess(reportLimits) };
  });
}
