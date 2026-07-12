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

// FiscalEvent.items/payments are unconstrained Json (z.record(z.unknown())
// on the wire, docs/POS_SYNC_API.md) — no fixed field names guaranteed.
// Same alias list and reasoning as pos-sync/admin-routes.ts's pickField;
// duplicated rather than imported for the same reason policy-routes.ts
// duplicates authenticateSystem — not worth a cross-module coupling for
// four lines.
function pickItemField(obj: any, keys: string[]): any {
  for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
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
    // "последние 30 дней" for the new multi-channel fields below —
    // deliberately a separate rolling window from `monthStart` above
    // (calendar month-to-date), which the pre-existing back-compat
    // revenue.month/orders fields keep using unchanged.
    const last30DaysStart = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    const onlineCutoff = new Date(now.getTime() - 5 * 60 * 1000);

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

    // ── Multi-channel data (Sellgram/POS/B2B) ──────────────────────────────
    // SalesChannel only has TELEGRAM/B2B (schema.prisma) — "sellgram" below
    // means Order.salesChannel = 'TELEGRAM', the real enum value for the
    // Telegram storefront channel. A second, separate Promise.all rather
    // than folding into the block above — keeps every back-compat field's
    // query untouched, at the cost of one extra sequential round trip.
    const [
      sellgramOrdersToday,
      sellgramOrdersPending,
      sellgramOrdersMonth,
      sellgramRevenueTodayAgg,
      sellgramRevenueMonthAgg,
      posDevicesOnline,
      posDevicesTotal,
      posShiftsToday,
      posReceiptsToday,
      posRevenueTodayAgg,
      posRevenueMonthAgg,
      b2bCounterpartiesActive,
      b2bTotalDebtAgg,
      b2bOrdersMonth,
      b2bRevenueTodayAgg,
      b2bRevenueMonthAgg,
      posDeviceList,
      recentTelegramOrders,
      sellgramOrders14d,
      posEvents14d,
      b2bLedger14d,
      orderItemGroups30d,
      fiscalEventsForItems30d,
    ] = await Promise.all([
      prisma.order.count({ where: { tenantId, salesChannel: 'TELEGRAM', createdAt: { gte: today } } }),
      prisma.order.count({ where: { tenantId, salesChannel: 'TELEGRAM', status: 'NEW' } }),
      prisma.order.count({ where: { tenantId, salesChannel: 'TELEGRAM', createdAt: { gte: last30DaysStart } } }),
      prisma.order.aggregate({ where: { tenantId, salesChannel: 'TELEGRAM', status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: today } }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { tenantId, salesChannel: 'TELEGRAM', status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: last30DaysStart } }, _sum: { total: true } }),
      prisma.posDevice.count({ where: { tenantId, status: 'ACTIVE', lastSeenAt: { gte: onlineCutoff } } }),
      prisma.posDevice.count({ where: { tenantId } }),
      // "смен сегодня" — shifts opened today, so a shift shows up on the
      // dashboard the moment it starts rather than only once closed.
      prisma.shiftEvent.count({ where: { tenantId, eventType: 'SHIFT_OPENED', openedAtMs: { gte: today } } }),
      prisma.fiscalEvent.count({ where: { tenantId, eventType: 'FISCAL_SUCCESS', createdAtMs: { gte: today } } }),
      prisma.fiscalEvent.aggregate({ where: { tenantId, eventType: 'FISCAL_SUCCESS', createdAtMs: { gte: today } }, _sum: { totalAmount: true } }),
      prisma.fiscalEvent.aggregate({ where: { tenantId, eventType: 'FISCAL_SUCCESS', createdAtMs: { gte: last30DaysStart } }, _sum: { totalAmount: true } }),
      prisma.counterparty.count({ where: { tenantId, isActive: true } }),
      prisma.counterparty.aggregate({ where: { tenantId, currentDebt: { gt: 0 } }, _sum: { currentDebt: true } }),
      prisma.order.count({ where: { tenantId, salesChannel: 'B2B', createdAt: { gte: last30DaysStart } } }),
      prisma.counterpartyLedger.aggregate({ where: { tenantId, type: 'ORDER_CHARGE', createdAt: { gte: today } }, _sum: { delta: true } }),
      prisma.counterpartyLedger.aggregate({ where: { tenantId, type: 'ORDER_CHARGE', createdAt: { gte: last30DaysStart } }, _sum: { delta: true } }),
      prisma.posDevice.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { name: true, lastSeenAt: true }, orderBy: { name: 'asc' } }),
      prisma.order.findMany({
        where: { tenantId, salesChannel: 'TELEGRAM' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { customer: true, items: true },
      }),
      prisma.order.findMany({
        where: { tenantId, salesChannel: 'TELEGRAM', status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true, total: true },
      }),
      prisma.fiscalEvent.findMany({
        where: { tenantId, eventType: 'FISCAL_SUCCESS', createdAtMs: { gte: fourteenDaysAgo } },
        select: { createdAtMs: true, totalAmount: true },
      }),
      prisma.counterpartyLedger.findMany({
        where: { tenantId, type: 'ORDER_CHARGE', createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true, delta: true },
      }),
      prisma.orderItem.groupBy({
        by: ['name'],
        where: { order: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: last30DaysStart } } },
        _sum: { qty: true, total: true },
      }),
      prisma.fiscalEvent.findMany({
        where: { tenantId, eventType: 'FISCAL_SUCCESS', createdAtMs: { gte: last30DaysStart } },
        select: { items: true },
      }),
    ]);

    // 14-day, 3-channel revenue series — zero-filled like revenueByDay above.
    const sellgramByDate: Record<string, number> = {};
    for (const o of sellgramOrders14d) {
      const d = o.createdAt.toISOString().slice(0, 10);
      sellgramByDate[d] = (sellgramByDate[d] ?? 0) + Number(o.total);
    }
    const posByDate: Record<string, number> = {};
    for (const e of posEvents14d) {
      const d = e.createdAtMs.toISOString().slice(0, 10);
      // FiscalEvent.totalAmount is tiyin (1/100 UZS) — confirmed against
      // real production rows while building the POS Analytics screen.
      posByDate[d] = (posByDate[d] ?? 0) + Math.round((e.totalAmount || 0) / 100);
    }
    const b2bByDate: Record<string, number> = {};
    for (const l of b2bLedger14d) {
      const d = l.createdAt.toISOString().slice(0, 10);
      b2bByDate[d] = (b2bByDate[d] ?? 0) + Number(l.delta);
    }
    const revenueChart: { date: string; sellgram: number; pos: number; b2b: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      revenueChart.push({
        date: d,
        sellgram: sellgramByDate[d] ?? 0,
        pos: posByDate[d] ?? 0,
        b2b: b2bByDate[d] ?? 0,
      });
    }

    // Top 5 products across all channels — merges OrderItem (sellgram+b2b,
    // grouped by name at the DB level) with FiscalEvent.items (POS, raw
    // Json parsed in JS via pickItemField). Matched by product name since
    // FiscalEvent items carry no productId to join on.
    const productMap = new Map<string, { name: string; qty: number; amount: number }>();
    for (const g of orderItemGroups30d) {
      const prev = productMap.get(g.name) || { name: g.name, qty: 0, amount: 0 };
      prev.qty += Number(g._sum.qty) || 0;
      prev.amount += Number(g._sum.total) || 0;
      productMap.set(g.name, prev);
    }
    for (const fe of fiscalEventsForItems30d) {
      const items = Array.isArray(fe.items) ? (fe.items as any[]) : [];
      for (const item of items) {
        const name = String(pickItemField(item, ['name', 'title', 'productName']) ?? 'Unknown');
        // qty is fixed-point ×1000 (docs/POS_SYNC_API.md items; confirmed
        // against real production FiscalEvent rows — e.g. "qty": 2000 = 2
        // units), price/total are tiyin.
        const qty = Number(pickItemField(item, ['qty', 'quantity']) ?? 0) / 1000;
        const amount = Number(pickItemField(item, ['sum', 'total', 'amount']) ?? 0) / 100;
        const prev = productMap.get(name) || { name, qty: 0, amount: 0 };
        prev.qty += qty;
        prev.amount += amount;
        productMap.set(name, prev);
      }
    }
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const posStatus = posDeviceList.map((d) => ({
      name: d.name,
      online: !!d.lastSeenAt && d.lastSeenAt.getTime() >= onlineCutoff.getTime(),
      lastSeenAt: d.lastSeenAt,
    }));

    const recentOrdersOut = recentTelegramOrders.map((o: any) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      total: Number(o.total),
      status: o.status,
      createdAt: o.createdAt,
      customer: o.customer ? { firstName: o.customer.firstName } : null,
      items: (o.items || []).map((i: any) => ({ name: i.name, qty: i.qty })),
    }));

    const sellgramRevenueToday = Number(sellgramRevenueTodayAgg._sum.total) || 0;
    const sellgramRevenueMonth = Number(sellgramRevenueMonthAgg._sum.total) || 0;
    const posRevenueToday = Math.round((Number(posRevenueTodayAgg._sum.totalAmount) || 0) / 100);
    const posRevenueMonth = Math.round((Number(posRevenueMonthAgg._sum.totalAmount) || 0) / 100);
    const b2bRevenueToday = Number(b2bRevenueTodayAgg._sum.delta) || 0;
    const b2bRevenueMonth = Number(b2bRevenueMonthAgg._sum.delta) || 0;

    return {
      success: true,
      data: {
        // ── back-compat — unchanged shape, unchanged queries above ──
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

        // ── new multi-channel data ──
        summary: {
          revenueToday: sellgramRevenueToday + posRevenueToday + b2bRevenueToday,
          revenueMonth: sellgramRevenueMonth + posRevenueMonth + b2bRevenueMonth,
          revenueByChannel: { sellgram: sellgramRevenueToday, pos: posRevenueToday, b2b: b2bRevenueToday },
        },
        sellgram: {
          ordersToday: sellgramOrdersToday,
          ordersPending: sellgramOrdersPending,
          ordersMonth: sellgramOrdersMonth,
          revenueMonth: sellgramRevenueMonth,
        },
        pos: {
          devicesOnline: posDevicesOnline,
          devicesTotal: posDevicesTotal,
          shiftsToday: posShiftsToday,
          receiptsToday: posReceiptsToday,
          revenueToday: posRevenueToday,
        },
        b2b: {
          counterpartiesActive: b2bCounterpartiesActive,
          totalDebt: Number(b2bTotalDebtAgg._sum.currentDebt) || 0,
          ordersMonth: b2bOrdersMonth,
        },
        revenueChart,
        topProducts,
        recentOrders: recentOrdersOut,
        posStatus,
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
