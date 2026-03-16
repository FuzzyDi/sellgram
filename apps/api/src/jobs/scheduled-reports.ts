import prisma from '../lib/prisma.js';
import { sendEmail } from '../lib/email.js';
import type { ScheduledFrequency } from '@prisma/client';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Compute the next run time after a given base date for the given frequency.
 *  Always aligns to 08:00 UTC on the target day. */
export function calcNextRunAt(frequency: ScheduledFrequency, after: Date = new Date()): Date {
  const d = new Date(after);
  // Move to the next period start
  switch (frequency) {
    case 'DAILY':
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case 'WEEKLY':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case 'MONTHLY':
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
  }
  d.setUTCHours(8, 0, 0, 0);
  return d;
}

// ────────────────────────────────────────────────────────────────────────────
// CSV helpers (duplicated from analytics/routes for standalone use)
// ────────────────────────────────────────────────────────────────────────────

function toCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; title: string }>) {
  const escape = (input: unknown) => {
    const s = input === null || input === undefined ? '' : String(input);
    const withQuotes = s.replace(/"/g, '""');
    if (/[",\n]/.test(withQuotes)) return `"${withQuotes}"`;
    return withQuotes;
  };
  const header = columns.map((c) => escape(c.title)).join(',');
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Report data fetchers (mirror of analytics/routes.ts)
// ────────────────────────────────────────────────────────────────────────────

async function buildCsv(tenantId: string, reportType: string, periodDays: number): Promise<{ csv: string; filename: string } | null> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const stamp = new Date().toISOString().slice(0, 10);

  if (reportType === 'top-products') {
    const topProducts = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: since } } },
      _sum: { qty: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 1000,
    });
    const productIds = topProducts.map((p: any) => p.productId);
    const [products, fallbackNames] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }),
      prisma.orderItem.findMany({ where: { productId: { in: productIds } }, distinct: ['productId'], select: { productId: true, name: true } }),
    ]);
    const rows = topProducts.map((tp: any) => {
      const prod = products.find((p: any) => p.id === tp.productId);
      const fb = fallbackNames.find((n: any) => n.productId === tp.productId);
      return { productName: prod?.name || fb?.name || '-', totalQty: Number(tp._sum.qty) || 0, totalRevenue: Number(tp._sum.total) || 0 };
    });
    return {
      csv: toCsv(rows, [{ key: 'productName', title: 'Product' }, { key: 'totalQty', title: 'Qty' }, { key: 'totalRevenue', title: 'Revenue' }]),
      filename: `sellgram-top-products-${stamp}.csv`,
    };
  }

  if (reportType === 'revenue') {
    const orders = await prisma.order.findMany({
      where: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: since } },
      select: { total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const byDate: Record<string, { revenue: number; count: number }> = {};
    for (const o of orders) {
      const date = o.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { revenue: 0, count: 0 };
      byDate[date].revenue += Number(o.total);
      byDate[date].count += 1;
    }
    const rows = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date, orders: data.count, revenue: data.revenue }));
    return {
      csv: toCsv(rows, [{ key: 'date', title: 'Date' }, { key: 'orders', title: 'Orders' }, { key: 'revenue', title: 'Revenue' }]),
      filename: `sellgram-revenue-${stamp}.csv`,
    };
  }

  if (reportType === 'categories') {
    const items = await prisma.orderItem.findMany({
      where: { order: { tenantId, status: { in: ['COMPLETED', 'DELIVERED'] }, createdAt: { gte: since } } },
      select: { qty: true, total: true, product: { select: { categoryId: true, category: { select: { name: true } } } } },
    });
    const map = new Map<string, { categoryName: string; totalQty: number; totalRevenue: number }>();
    for (const item of items) {
      const key = item.product?.categoryId || '__none__';
      const name = item.product?.category?.name || 'Uncategorized';
      const prev = map.get(key) || { categoryName: name, totalQty: 0, totalRevenue: 0 };
      prev.totalQty += Number(item.qty) || 0;
      prev.totalRevenue += Number(item.total) || 0;
      map.set(key, prev);
    }
    const rows = Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
    return {
      csv: toCsv(rows, [{ key: 'categoryName', title: 'Category' }, { key: 'totalQty', title: 'Qty' }, { key: 'totalRevenue', title: 'Revenue' }]),
      filename: `sellgram-categories-${stamp}.csv`,
    };
  }

  if (reportType === 'customers') {
    const customers = await prisma.customer.findMany({
      where: { tenantId, OR: [{ createdAt: { gte: since } }, { orders: { some: { createdAt: { gte: since }, status: { in: ['COMPLETED', 'DELIVERED'] } } } }] },
      select: { firstName: true, lastName: true, telegramUser: true, ordersCount: true, totalSpent: true, loyaltyPoints: true },
      orderBy: [{ totalSpent: 'desc' }],
      take: 5000,
    });
    const rows = customers.map((c) => ({
      customer: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.telegramUser || '-',
      ordersCount: c.ordersCount,
      totalSpent: Number(c.totalSpent) || 0,
      loyaltyPoints: c.loyaltyPoints,
    }));
    return {
      csv: toCsv(rows, [{ key: 'customer', title: 'Customer' }, { key: 'ordersCount', title: 'Orders' }, { key: 'totalSpent', title: 'TotalSpent' }, { key: 'loyaltyPoints', title: 'LoyaltyPoints' }]),
      filename: `sellgram-customers-${stamp}.csv`,
    };
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Main runner — called every 15 minutes
// ────────────────────────────────────────────────────────────────────────────

export async function runScheduledReports(): Promise<void> {
  const now = new Date();
  const due = await prisma.scheduledReport.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: {
      tenant: {
        include: {
          users: { where: { role: 'OWNER', isActive: true }, select: { email: true } },
        },
      },
    },
  });

  if (due.length === 0) return;

  for (const report of due) {
    const emails = report.tenant.users.map((u: any) => u.email).filter(Boolean);
    if (emails.length === 0) {
      // No owner email — just advance nextRunAt so we don't hammer DB
      await prisma.scheduledReport.update({
        where: { id: report.id },
        data: { nextRunAt: calcNextRunAt(report.frequency, report.nextRunAt) },
      });
      continue;
    }

    try {
      const result = await buildCsv(report.tenant.id, report.reportType, report.periodDays);
      if (!result) continue;

      const frequencyLabel: Record<ScheduledFrequency, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };
      const reportLabel: Record<string, string> = {
        'top-products': 'Top Products',
        revenue: 'Revenue',
        categories: 'Categories',
        customers: 'Customers',
      };

      const subject = `[SellGram] ${frequencyLabel[report.frequency]} ${reportLabel[report.reportType] ?? report.reportType} Report — ${new Date().toLocaleDateString('en-GB')}`;
      const text = `Hello,\n\nPlease find your scheduled ${reportLabel[report.reportType] ?? report.reportType} report for the last ${report.periodDays} days attached.\n\nStore: ${report.tenant.name}\nPeriod: ${report.periodDays} days\n\n— SellGram`;

      await sendEmail({
        to: emails,
        subject,
        text,
        attachments: [{ filename: result.filename, content: result.csv, contentType: 'text/csv; charset=utf-8' }],
      });
    } catch (err) {
      console.error(`[scheduled-reports] failed for ${report.id}:`, err);
    }

    await prisma.scheduledReport.update({
      where: { id: report.id },
      data: {
        lastSentAt: now,
        nextRunAt: calcNextRunAt(report.frequency, report.nextRunAt),
      },
    });
  }
}

export function startScheduledReportsRunner(): void {
  // Run once shortly after startup, then every 15 minutes
  setTimeout(() => void runScheduledReports(), 60_000);
  setInterval(() => void runScheduledReports(), 15 * 60 * 1000);
}
