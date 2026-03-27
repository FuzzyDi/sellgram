import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { getRedis } from '../../lib/redis.js';
import { PLANS, type PlanCode, type ReportsLevel } from '@sellgram/shared';
import { calcNextRunAt } from '../../jobs/scheduled-reports.js';
import { getEffectivePlan } from '../../lib/billing.js';

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
  maxExportsPerMonth: number;
};

function hasReportsLevel(current: ReportsLevel, required: ReportsLevel) {
  return REPORTS_LEVEL_WEIGHT[current] >= REPORTS_LEVEL_WEIGHT[required];
}

function clampDays(raw: unknown, maxDays: number, fallback: number) {
  const val = Number(raw);
  if (!Number.isFinite(val) || val <= 0) return Math.min(fallback, maxDays);
  return Math.max(1, Math.min(Math.round(val), maxDays));
}

const topProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  period: z.coerce.number().int().min(1).max(365).default(30),
});
const revenueQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
const categoriesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const customersReportQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
  limit: z.coerce.number().int().min(1).max(200).default(30),
});
const exportQuerySchema = z.object({
  type: z.enum(['top-products', 'revenue', 'categories', 'customers']).default('top-products'),
  days: z.coerce.number().int().min(1).max(365).default(30),
});
const createScheduledReportSchema = z.object({
  reportType: z.enum(['top-products', 'revenue', 'categories', 'customers']),
  periodDays: z.number().int().min(1).max(365),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
});
const scheduledReportIdSchema = z.object({ id: z.string().min(1) });

function getReportAccess(reportLimits: ReportLimits) {
  return {
    basic: hasReportsLevel(reportLimits.reportsLevel, 'BASIC'),
    advanced: hasReportsLevel(reportLimits.reportsLevel, 'ADVANCED'),
    full: hasReportsLevel(reportLimits.reportsLevel, 'FULL'),
    export: reportLimits.allowReportExport,
  };
}

function getMonthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function secondsUntilNextMonth(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const next = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  return Math.max(60, Math.ceil((next.getTime() - date.getTime()) / 1000));
}

function exportUsageKey(tenantId: string, monthKey: string) {
  return `reports:exports:${tenantId}:${monthKey}`;
}

async function getMonthlyExportUsage(tenantId: string) {
  const monthKey = getMonthKey();
  const key = exportUsageKey(tenantId, monthKey);
  const raw = await getRedis().get(key);
  return {
    monthKey,
    count: Number(raw || 0),
  };
}

async function incrementMonthlyExportUsage(tenantId: string) {
  const monthKey = getMonthKey();
  const key = exportUsageKey(tenantId, monthKey);
  const redis = getRedis();
  const value = await redis.incr(key);
  const ttl = await redis.ttl(key);
  if (ttl < 0) {
    await redis.expire(key, secondsUntilNextMonth());
  }
  return value;
}

function ensureCsvValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function toCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; title: string }>) {
  const escape = (input: unknown) => {
    const s = ensureCsvValue(input);
    const withQuotes = s.replace(/"/g, '""');
    if (/[",\n]/.test(withQuotes)) return `"${withQuotes}"`;
    return withQuotes;
  };

  const header = columns.map((c) => escape(c.title)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

async function getTenantReportLimits(tenantId: string): Promise<ReportLimits> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, planExpiresAt: true },
  });

  const fallback = PLANS.FREE;
  const effectivePlanCode = getEffectivePlan(tenant?.plan, tenant?.planExpiresAt) as PlanCode;
  const plan = PLANS[effectivePlanCode] || fallback;
  const planCode = plan.code;
  const fallbackExports = planCode === 'BUSINESS' ? -1 : planCode === 'PRO' ? 50 : 0;

  return {
    planCode,
    reportsLevel: plan.limits.reportsLevel,
    reportsHistoryDays: plan.limits.reportsHistoryDays,
    allowReportExport: plan.limits.allowReportExport,
    maxReportsPerMonth: plan.limits.maxReportsPerMonth,
    maxScheduledReports: plan.limits.maxScheduledReports,
    maxExportsPerMonth: Number(plan.limits.maxExportsPerMonth ?? fallbackExports),
  };
}

async function fetchTopProducts(tenantId: string, periodDays: number, limit = 10) {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const topProducts = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      order: {
        tenantId,
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

  return topProducts.map((tp: any) => {
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
}

async function fetchRevenueSeries(tenantId: string, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
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

  // Zero-fill all days in the range so the chart has a continuous x-axis
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    result.push({ date: d, ...(byDate[d] || { revenue: 0, count: 0 }) });
  }
  return result;
}

async function fetchNewCustomersSeries(tenantId: string, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const customers = await prisma.customer.findMany({
    where: { tenantId, createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const byDate: Record<string, number> = {};
  for (const c of customers) {
    const date = c.createdAt.toISOString().split('T')[0];
    byDate[date] = (byDate[date] ?? 0) + 1;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    result.push({ date: d, count: byDate[d] ?? 0 });
  }
  return result;
}

async function fetchCategoryReport(tenantId: string, days: number, limit: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        tenantId,
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

  return Array.from(map.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}

async function fetchCustomersReport(tenantId: string, days: number, limit: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const customers = await prisma.customer.findMany({
    where: {
      tenantId,
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
    take: limit,
  });

  return customers.map((customer) => ({
    ...customer,
    totalSpent: Number(customer.totalSpent) || 0,
    displayName:
      [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || customer.telegramUser || customer.id,
  }));
}

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/analytics/reports/meta', async (request) => {
    const tenantId = request.tenantId!;
    const reportLimits = await getTenantReportLimits(tenantId);
    const usage = await getMonthlyExportUsage(tenantId);
    const exportsLeft = reportLimits.maxExportsPerMonth < 0
      ? -1
      : Math.max(0, reportLimits.maxExportsPerMonth - usage.count);

    return {
      success: true,
      data: {
        reportLimits,
        reportAccess: getReportAccess(reportLimits),
        usage: {
          exportsThisMonth: usage.count,
          exportsLeft,
          monthKey: usage.monthKey,
        },
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
      return reply.status(402).send({ success: false, error: 'Reports are not available on your current plan. Please upgrade.' });
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const fourteenDaysAgo = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000);

    const [
      totalOrders,
      todayOrders,
      weekOrders,
      completedOrders,
      todayRevenue,
      weekRevenue,
      monthRevenue,
      totalCustomers,
      customersFromOrdersResult,
      totalProducts,
      newCustomersWeek,
      pendingOrders,
      soldProductsResult,
      repeatCustomers,
      reviewStats,
      recentOrders,
    ] = await Promise.all([
      prisma.order.count({ where: { tenantId } }),
      prisma.order.count({ where: { tenantId, createdAt: { gte: today } } }),
      prisma.order.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      prisma.order.count({ where: { tenantId, status: 'COMPLETED' } }),
      prisma.order.aggregate({ where: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: today } }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: weekAgo } }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: monthStart } }, _sum: { total: true }, _avg: { total: true } }),
      prisma.customer.count({ where: { tenantId } }),
      // COUNT(DISTINCT) avoids loading all rows into memory
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT "customerId")::bigint AS count FROM orders WHERE "tenantId" = ${tenantId}
      `,
      prisma.product.count({ where: { tenantId } }),
      prisma.customer.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      prisma.order.count({ where: { tenantId, status: 'NEW' } }),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT oi."productId")::bigint AS count
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE o."tenantId" = ${tenantId} AND o.status IN ('COMPLETED', 'DELIVERED')
      `,
      prisma.customer.count({ where: { tenantId, ordersCount: { gt: 1 } } }),
      prisma.orderReview.aggregate({ where: { tenantId }, _avg: { rating: true }, _count: { rating: true } }),
      prisma.order.findMany({
        where: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true, total: true },
      }),
    ]);

    const customersFromOrdersCount = Number(customersFromOrdersResult[0]?.count ?? 0);
    const soldProductsCount = Number(soldProductsResult[0]?.count ?? 0);
    const productsTotal = Math.max(totalProducts, soldProductsCount);

    // Build 14-day revenue series with zero-fill for missing days
    const revenueMap: Record<string, number> = {};
    for (const o of recentOrders) {
      const d = o.createdAt.toISOString().slice(0, 10);
      revenueMap[d] = (revenueMap[d] ?? 0) + Number(o.total);
    }
    const revenueByDay: { date: string; revenue: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      revenueByDay.push({ date: d, revenue: revenueMap[d] ?? 0 });
    }

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
          total: Math.max(totalCustomers, customersFromOrdersCount),
          fromOrders: customersFromOrdersCount,
          newThisWeek: newCustomersWeek,
          repeatRate: totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0,
        },
        products: { total: productsTotal },
        reviews: {
          avg: reviewStats._avg.rating ? Math.round(reviewStats._avg.rating * 10) / 10 : null,
          count: reviewStats._count.rating,
        },
        revenueByDay,
      },
      reportLimits,
      reportAccess: getReportAccess(reportLimits),
    };
  });

  // Summary KPIs for selected period (BASIC+)
  const summaryQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(365).default(30),
  });

  fastify.get('/analytics/summary', async (request, reply) => {
    const tenantId = request.tenantId!;
    const reportLimits = await getTenantReportLimits(tenantId);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'BASIC')) {
      return reply.status(402).send({ success: false, error: 'Reports are not available on your current plan.' });
    }
    let days: number;
    try { ({ days } = summaryQuerySchema.parse(request.query)); }
    catch (err: any) { return reply.status(400).send({ success: false, error: err.message }); }

    const safeDays = clampDays(days, Number(reportLimits.reportsHistoryDays || 30), 30);
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const [orders, newCustomers] = await Promise.all([
      prisma.order.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { total: true, status: true },
      }),
      prisma.customer.count({ where: { tenantId, createdAt: { gte: since } } }),
    ]);

    const completed = orders.filter((o) => o.status === 'COMPLETED' || o.status === 'DELIVERED');
    const revenue = completed.reduce((s, o) => s + Number(o.total), 0);
    const avgCheck = completed.length > 0 ? Math.round(revenue / completed.length) : 0;

    return {
      success: true,
      data: {
        ordersCount: orders.length,
        completedCount: completed.length,
        cancelledCount: orders.filter((o) => o.status === 'CANCELLED').length,
        revenue,
        avgCheck,
        newCustomers,
        days: safeDays,
      },
    };
  });

  // Top products
  fastify.get('/analytics/top-products', async (request, reply) => {
    const tenantId = request.tenantId!;
    const reportLimits = await getTenantReportLimits(tenantId);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'BASIC')) {
      return reply.status(402).send({ success: false, error: 'Reports are not available on your current plan. Please upgrade.' });
    }

    let limit: number, period: number;
    try {
      ({ limit, period } = topProductsQuerySchema.parse(request.query));
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const safePeriod = clampDays(period, Number(reportLimits.reportsHistoryDays || 30), 30);
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const data = await fetchTopProducts(tenantId, safePeriod, safeLimit);

    return { success: true, data, reportLimits, reportAccess: getReportAccess(reportLimits) };
  });

  // Revenue time series
  fastify.get('/analytics/revenue', async (request, reply) => {
    const tenantId = request.tenantId!;
    const reportLimits = await getTenantReportLimits(tenantId);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'ADVANCED')) {
      return reply.status(402).send({ success: false, error: 'Advanced reports are available on PRO/BUSINESS plans only.' });
    }

    let days: number;
    try {
      ({ days } = revenueQuerySchema.parse(request.query));
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const safeDays = clampDays(days, Number(reportLimits.reportsHistoryDays || 30), 30);
    const data = await fetchRevenueSeries(tenantId, safeDays);

    return { success: true, data, reportLimits, reportAccess: getReportAccess(reportLimits) };
  });

  // New customers time series (ADVANCED)
  fastify.get('/analytics/new-customers-series', async (request, reply) => {
    const tenantId = request.tenantId!;
    const reportLimits = await getTenantReportLimits(tenantId);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'ADVANCED')) {
      return reply.status(402).send({ success: false, error: 'Advanced reports are available on PRO/BUSINESS plans only.' });
    }
    let days: number;
    try {
      ({ days } = revenueQuerySchema.parse(request.query));
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const safeDays = clampDays(days, Number(reportLimits.reportsHistoryDays || 30), 30);
    const data = await fetchNewCustomersSeries(tenantId, safeDays);
    return { success: true, data };
  });

  // Sales by categories (ADVANCED)
  fastify.get('/analytics/report-categories', async (request, reply) => {
    const tenantId = request.tenantId!;
    const reportLimits = await getTenantReportLimits(tenantId);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'ADVANCED')) {
      return reply.status(402).send({ success: false, error: 'Advanced reports are available on PRO/BUSINESS plans only.' });
    }

    let days: number, limit: number;
    try {
      ({ days, limit } = categoriesQuerySchema.parse(request.query));
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const safeDays = clampDays(days, Number(reportLimits.reportsHistoryDays || 30), 30);
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const data = await fetchCategoryReport(tenantId, safeDays, safeLimit);

    return { success: true, data, reportLimits, reportAccess: getReportAccess(reportLimits) };
  });

  // Customers value report (FULL)
  fastify.get('/analytics/report-customers', async (request, reply) => {
    const tenantId = request.tenantId!;
    const reportLimits = await getTenantReportLimits(tenantId);
    if (!hasReportsLevel(reportLimits.reportsLevel, 'FULL')) {
      return reply.status(402).send({ success: false, error: 'Full reports are available on BUSINESS plan only.' });
    }

    let days: number, limit: number;
    try {
      ({ days, limit } = customersReportQuerySchema.parse(request.query));
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }
    const safeDays = clampDays(days, Number(reportLimits.reportsHistoryDays || 90), 90);
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const data = await fetchCustomersReport(tenantId, safeDays, safeLimit);

    return { success: true, data, reportLimits, reportAccess: getReportAccess(reportLimits) };
  });

  // CSV export by report type
  fastify.get('/analytics/reports/export', async (request, reply) => {
    const tenantId = request.tenantId!;
    const reportLimits = await getTenantReportLimits(tenantId);
    let reportType: string, days: number;
    try {
      ({ type: reportType, days } = exportQuerySchema.parse(request.query));
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    if (!reportLimits.allowReportExport) {
      return reply.status(402).send({ success: false, error: 'Export is not available on your current plan.' });
    }

    // Atomic increment-first to prevent concurrent requests from bypassing the limit.
    // If over limit, decrement (rollback) and reject.
    let exportCount = -1;
    if (reportLimits.maxExportsPerMonth >= 0) {
      exportCount = await incrementMonthlyExportUsage(tenantId);
      if (exportCount > reportLimits.maxExportsPerMonth) {
        await getRedis().decr(exportUsageKey(tenantId, getMonthKey()));
        return reply.status(402).send({
          success: false,
          error: `Monthly export limit reached (${reportLimits.maxExportsPerMonth}).`,
        });
      }
    }

    const safeDays = clampDays(days, Number(reportLimits.reportsHistoryDays || 30), 30);

    let rows: Array<Record<string, unknown>> = [];
    let columns: Array<{ key: string; title: string }> = [];

    if (reportType === 'top-products') {
      if (!hasReportsLevel(reportLimits.reportsLevel, 'BASIC')) {
        return reply.status(402).send({ success: false, error: 'This report is not available on your plan.' });
      }
      const data = await fetchTopProducts(tenantId, safeDays, 1000);
      rows = data.map((item) => ({
        productName: item.productName,
        totalQty: item.totalQty,
        totalRevenue: item.totalRevenue,
      }));
      columns = [
        { key: 'productName', title: 'Product' },
        { key: 'totalQty', title: 'Qty' },
        { key: 'totalRevenue', title: 'Revenue' },
      ];
    } else if (reportType === 'revenue') {
      if (!hasReportsLevel(reportLimits.reportsLevel, 'ADVANCED')) {
        return reply.status(402).send({ success: false, error: 'This report is not available on your plan.' });
      }
      const data = await fetchRevenueSeries(tenantId, safeDays);
      rows = data.map((item) => ({ date: item.date, orders: item.count, revenue: item.revenue }));
      columns = [
        { key: 'date', title: 'Date' },
        { key: 'orders', title: 'Orders' },
        { key: 'revenue', title: 'Revenue' },
      ];
    } else if (reportType === 'categories') {
      if (!hasReportsLevel(reportLimits.reportsLevel, 'ADVANCED')) {
        return reply.status(402).send({ success: false, error: 'This report is not available on your plan.' });
      }
      const data = await fetchCategoryReport(tenantId, safeDays, 1000);
      rows = data.map((item) => ({
        categoryName: item.categoryName,
        totalQty: item.totalQty,
        totalRevenue: item.totalRevenue,
      }));
      columns = [
        { key: 'categoryName', title: 'Category' },
        { key: 'totalQty', title: 'Qty' },
        { key: 'totalRevenue', title: 'Revenue' },
      ];
    } else if (reportType === 'customers') {
      if (!hasReportsLevel(reportLimits.reportsLevel, 'FULL')) {
        return reply.status(402).send({ success: false, error: 'This report is not available on your plan.' });
      }
      const data = await fetchCustomersReport(tenantId, safeDays, 5000);
      rows = data.map((item) => ({
        customer: item.displayName,
        ordersCount: item.ordersCount,
        totalSpent: item.totalSpent,
        loyaltyPoints: item.loyaltyPoints,
      }));
      columns = [
        { key: 'customer', title: 'Customer' },
        { key: 'ordersCount', title: 'Orders' },
        { key: 'totalSpent', title: 'TotalSpent' },
        { key: 'loyaltyPoints', title: 'LoyaltyPoints' },
      ];
    } else {
      return reply.status(400).send({ success: false, error: 'Unknown report type.' });
    }

    const exportsLeft = reportLimits.maxExportsPerMonth < 0
      ? -1
      : Math.max(0, reportLimits.maxExportsPerMonth - exportCount);

    const csv = toCsv(rows, columns);
    const stamp = new Date().toISOString().slice(0, 10);
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="sellgram-${reportType}-${stamp}.csv"`)
      .header('X-Report-Exports-Left', String(exportsLeft))
      .send(csv);
  });

  // ── Scheduled reports CRUD ───────────────────────────────────────────────

  fastify.get('/analytics/scheduled-reports', async (request) => {
    const tenantId = request.tenantId!;
    const data = await prisma.scheduledReport.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, reportType: true, periodDays: true, frequency: true, lastSentAt: true, nextRunAt: true, createdAt: true },
    });
    return { success: true, data };
  });

  fastify.post('/analytics/scheduled-reports', async (request, reply) => {
    const tenantId = request.tenantId!;
    let body: z.infer<typeof createScheduledReportSchema>;
    try {
      body = createScheduledReportSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const reportLimits = await getTenantReportLimits(tenantId);
    if (reportLimits.maxScheduledReports === 0) {
      return reply.status(402).send({ success: false, error: 'Scheduled reports are not available on your current plan.' });
    }

    if (reportLimits.maxScheduledReports > 0) {
      const existing = await prisma.scheduledReport.count({ where: { tenantId, isActive: true } });
      if (existing >= reportLimits.maxScheduledReports) {
        return reply.status(402).send({ success: false, error: `Plan limit reached (${reportLimits.maxScheduledReports} scheduled reports).` });
      }
    }

    const nextRunAt = calcNextRunAt(body.frequency);
    const data = await prisma.scheduledReport.create({
      data: { tenantId, reportType: body.reportType, periodDays: body.periodDays, frequency: body.frequency, nextRunAt },
      select: { id: true, reportType: true, periodDays: true, frequency: true, lastSentAt: true, nextRunAt: true, createdAt: true },
    });
    return { success: true, data };
  });

  fastify.delete('/analytics/scheduled-reports/:id', async (request, reply) => {
    const tenantId = request.tenantId!;
    let id: string;
    try {
      ({ id } = scheduledReportIdSchema.parse(request.params));
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: 'Invalid id' });
    }

    const report = await prisma.scheduledReport.findFirst({ where: { id, tenantId } });
    if (!report) return reply.status(404).send({ success: false, error: 'Not found' });

    await prisma.scheduledReport.update({ where: { id }, data: { isActive: false } });
    return { success: true, message: 'Deleted' };
  });
}
