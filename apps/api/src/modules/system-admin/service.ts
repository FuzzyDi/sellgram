import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma.js';
import { signSystemToken } from '../../lib/system-jwt.js';
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js';
import { getConfig } from '../../config/index.js';
import { getRedis } from '../../lib/redis.js';
import { PLANS, type PlanCode, type ReportsLevel } from '@sellgram/shared';
import { getErrors } from '../../lib/error-buffer.js';
import { getBotStatuses, sendMessageToOwner } from '../../bot/bot-manager.js';
import { getS3, ensureBucket } from '../../lib/s3.js';
import { getAllPlanConfigs, updatePlanConfig, type PlanLimitsOverride } from '../../lib/plan-config.js';
const SUBSCRIPTION_REMINDER_SETTINGS_KEY = 'subscription_reminders';
const MONITOR_SETTINGS_KEY = 'monitor_settings';
function getMonthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function resolveReportExportLimit(plan: PlanCode) {
  const planCfg = PLANS[plan] || PLANS.FREE;
  const allowExport = Boolean(planCfg.limits.allowReportExport);
  const fallback = plan === 'BUSINESS' ? -1 : plan === 'PRO' ? 50 : 0;
  const maxExportsPerMonth = Number(planCfg.limits.maxExportsPerMonth ?? fallback);
  return {
    allowExport,
    maxExportsPerMonth,
    reportsLevel: planCfg.limits.reportsLevel as ReportsLevel,
  };
}

function computeExportsLeft(max: number, used: number) {
  if (max < 0) return -1;
  return Math.max(0, max - used);
}

type SubscriptionReminderSettings = {
  enabled: boolean;
  days: number[];
};

function parseReminderDays(raw: unknown): number[] {
  const source = typeof raw === 'string' ? raw : '';
  const parsed = source
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isInteger(x) && x >= 1 && x <= 30);
  return Array.from(new Set(parsed)).sort((a, b) => b - a);
}

function normalizeReminderDays(days: unknown): number[] {
  const arr = Array.isArray(days) ? days : [];
  const parsed = arr
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x >= 1 && x <= 30);
  return Array.from(new Set(parsed)).sort((a, b) => b - a);
}

export async function getSystemSubscriptionReminderSettings(): Promise<SubscriptionReminderSettings> {
  const cfg = getConfig();
  const fallback: SubscriptionReminderSettings = {
    enabled: cfg.SUBSCRIPTION_REMINDER_ENABLED,
    days: parseReminderDays(cfg.SUBSCRIPTION_REMINDER_DAYS || '7,3,1'),
  };

  const row = await prisma.systemSetting.findUnique({
    where: { key: SUBSCRIPTION_REMINDER_SETTINGS_KEY },
    select: { value: true },
  });
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
    return fallback;
  }

  const value = row.value as Record<string, unknown>;
  const parsedDays = normalizeReminderDays(value.days);
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
    days: parsedDays.length > 0 ? parsedDays : fallback.days,
  };
}

export async function updateSystemSubscriptionReminderSettings(input: {
  enabled?: boolean;
  days?: number[];
}): Promise<SubscriptionReminderSettings> {
  const current = await getSystemSubscriptionReminderSettings();
  const next: SubscriptionReminderSettings = {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    days: Array.isArray(input.days) ? normalizeReminderDays(input.days) : current.days,
  };

  if (next.days.length === 0) {
    next.days = current.days.length > 0 ? current.days : [7, 3, 1];
  }

  await prisma.systemSetting.upsert({
    where: { key: SUBSCRIPTION_REMINDER_SETTINGS_KEY },
    create: {
      key: SUBSCRIPTION_REMINDER_SETTINGS_KEY,
      value: ({ enabled: next.enabled, days: next.days } as any),
    },
    update: {
      value: ({ enabled: next.enabled, days: next.days } as any),
    },
  });

  return next;
}

type MonitorSettings = {
  botToken: string;
  chatId: string;
  diskThreshold: number;
};

export async function getMonitorSettings(): Promise<MonitorSettings> {
  const cfg = getConfig();
  const fallback: MonitorSettings = {
    botToken: (cfg as any).MONITOR_TELEGRAM_BOT_TOKEN || '',
    chatId: (cfg as any).MONITOR_TELEGRAM_CHAT_ID || '',
    diskThreshold: Number((cfg as any).MONITOR_DISK_THRESHOLD || 85),
  };

  const row = await prisma.systemSetting.findUnique({
    where: { key: MONITOR_SETTINGS_KEY },
    select: { value: true },
  });
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
    return fallback;
  }

  const v = row.value as Record<string, unknown>;
  return {
    botToken: typeof v.botToken === 'string' ? v.botToken : fallback.botToken,
    chatId: typeof v.chatId === 'string' ? v.chatId : fallback.chatId,
    diskThreshold: typeof v.diskThreshold === 'number' ? v.diskThreshold : fallback.diskThreshold,
  };
}

export async function updateMonitorSettings(input: Partial<MonitorSettings>): Promise<MonitorSettings> {
  const current = await getMonitorSettings();
  const next: MonitorSettings = {
    botToken: typeof input.botToken === 'string' ? input.botToken : current.botToken,
    chatId: typeof input.chatId === 'string' ? input.chatId : current.chatId,
    diskThreshold: typeof input.diskThreshold === 'number' ? Number(input.diskThreshold) : current.diskThreshold,
  };

  await prisma.systemSetting.upsert({
    where: { key: MONITOR_SETTINGS_KEY },
    create: { key: MONITOR_SETTINGS_KEY, value: next as any },
    update: { value: next as any },
  });

  return next;
}

export async function loginSystemAdmin(input: { email: string; password: string }) {
  const admin = await prisma.systemAdmin.findUnique({ where: { email: input.email } });
  if (!admin?.isActive) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(input.password, admin.passwordHash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const token = await signSystemToken({
    type: 'system_admin',
    adminId: admin.id,
    email: admin.email,
  });

  return { token, admin: { id: admin.id, email: admin.email, name: admin.name } };
}

async function logSystemAction(input: {
  action: 'TENANT_PLAN_UPDATED' | 'INVOICE_CONFIRMED' | 'INVOICE_REJECTED';
  actorId?: string;
  actorEmail?: string;
  targetType: 'tenant' | 'invoice';
  targetId: string;
  details?: Record<string, unknown>;
}) {
  await prisma.systemAuditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId || null,
      actorEmail: input.actorEmail || null,
      targetType: input.targetType,
      targetId: input.targetId,
      details: (input.details || {}) as any,
    },
  });
}

export async function getSystemDashboard() {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const in7days = new Date(Date.now() + 7 * 86400000);
  const [tenants, activeStores, pendingInvoices, monthlyOrders, pendingAmountAgg, paidInvoicesMonth, paidRevenueMonthAgg, expiringPlans] = await Promise.all([
    prisma.tenant.count(),
    prisma.store.count({ where: { isActive: true } }),
    prisma.invoice.count({ where: { status: 'PENDING', paymentRef: { not: null } } }),
    prisma.order.count({
      where: {
        createdAt: {
          gte: startOfMonth,
        },
      },
    }),
    prisma.invoice.aggregate({
      where: { status: 'PENDING', paymentRef: { not: null } },
      _sum: { amount: true },
    }),
    prisma.invoice.count({
      where: {
        status: 'PAID',
        confirmedAt: { gte: startOfMonth },
      },
    }),
    prisma.invoice.aggregate({
      where: {
        status: 'PAID',
        confirmedAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.tenant.count({ where: { plan: { not: 'FREE' }, planExpiresAt: { gte: now, lte: in7days } } }),
  ]);

  return {
    tenants,
    activeStores,
    pendingInvoices,
    monthlyOrders,
    pendingAmount: Number(pendingAmountAgg._sum.amount || 0),
    paidInvoicesMonth,
    paidRevenueMonth: Number(paidRevenueMonthAgg._sum.amount || 0),
    expiringPlans,
  };
}

export async function getSystemHealth() {
  const dbStart = Date.now();
  let dbOk = true;
  try { await prisma.$queryRawUnsafe('SELECT 1'); } catch { dbOk = false; }
  const dbLatencyMs = Date.now() - dbStart;

  let redisOk = false;
  let redisLatencyMs: number | null = null;
  const queues: Record<string, { waiting: number; active: number; failed: number }> = {};
  try {
    const redis = getRedis();
    const redisStart = Date.now();
    await redis.ping();
    redisOk = true;
    redisLatencyMs = Date.now() - redisStart;

    for (const qName of ['broadcast', 'daily-digest']) {
      try {
        const [waiting, active, failed] = await Promise.all([
          redis.llen(`bull:${qName}:wait`),
          redis.llen(`bull:${qName}:active`),
          redis.zcard(`bull:${qName}:failed`),
        ]);
        queues[qName] = { waiting, active, failed };
      } catch { /* queue may not exist yet */ }
    }
  } catch { /* Redis not available */ }

  const [tenants, activeStores, pendingInvoices] = await Promise.all([
    prisma.tenant.count(),
    prisma.store.count({ where: { isActive: true } }),
    prisma.invoice.count({ where: { status: 'PENDING', paymentRef: { not: null } } }),
  ]);

  const reminder = await getSystemSubscriptionReminderSettings();

  return {
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db: { ok: dbOk, latencyMs: dbLatencyMs },
    redis: { ok: redisOk, latencyMs: redisLatencyMs },
    queues,
    runtime: {
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node: process.version,
    },
    counters: { tenants, activeStores, pendingInvoices },
    subscriptionReminders: { enabled: reminder.enabled, days: reminder.days },
  };
}

export async function listSystemActivity(input: {
  limit: number;
  action?: 'TENANT_PLAN_UPDATED' | 'INVOICE_CONFIRMED' | 'INVOICE_REJECTED';
  targetType?: 'tenant' | 'invoice';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const where: any = {};

  if (input.action) where.action = input.action;
  if (input.targetType) where.targetType = input.targetType;

  if (input.search) {
    where.OR = [
      { actorEmail: { contains: input.search, mode: 'insensitive' } },
      { targetId: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  if (input.dateFrom || input.dateTo) {
    where.createdAt = {};
    if (input.dateFrom) where.createdAt.gte = new Date(input.dateFrom);
    if (input.dateTo) where.createdAt.lte = new Date(input.dateTo);
  }

  const logs = await prisma.systemAuditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: input.limit,
  });

  return logs.map((log: (typeof logs)[number]) => ({
    id: log.id,
    type: log.action,
    at: log.createdAt,
    actor: log.actorEmail || log.actorId || 'system',
    message:
      log.action === 'INVOICE_CONFIRMED'
        ? 'Invoice confirmed'
        : log.action === 'INVOICE_REJECTED'
        ? 'Invoice rejected'
        : 'Tenant plan updated',
    context: log.details || {},
  }));
}

export async function listSystemTenants(input: { page: number; pageSize: number; search?: string }) {
  const skip = (input.page - 1) * input.pageSize;
  const where: any = {};
  if (input.search) {
    where.OR = [{ name: { contains: input.search, mode: 'insensitive' } }, { slug: { contains: input.search, mode: 'insensitive' } }];
  }

  const [items, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: {
        _count: {
          select: {
            users: true,
            stores: true,
            products: true,
            orders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: input.pageSize,
    }),
    prisma.tenant.count({ where }),
  ]);

  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export async function updateSystemTenantPlan(input: {
  id: string;
  plan: 'FREE' | 'PRO' | 'BUSINESS';
  planExpiresAt?: string;
  changedBy?: string;
}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.id } });
  if (!tenant) {
    throw new Error('TENANT_NOT_FOUND');
  }

  const updated = await prisma.tenant.update({
    where: { id: input.id },
    data: {
      plan: input.plan,
      planExpiresAt: input.planExpiresAt ? new Date(input.planExpiresAt) : null,
    },
  });

  await logSystemAction({
    action: 'TENANT_PLAN_UPDATED',
    actorEmail: input.changedBy || 'system',
    targetType: 'tenant',
    targetId: input.id,
    details: {
      tenantId: input.id,
      plan: input.plan,
      planExpiresAt: input.planExpiresAt || null,
      changedBy: input.changedBy || 'system',
    },
  });

  return updated;
}


export async function listSystemReportsUsage(input: {
  month?: string;
  search?: string;
  page: number;
  pageSize: number;
}) {
  const monthKey = input.month || getMonthKey();
  const skip = (input.page - 1) * input.pageSize;

  const where: any = {};
  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { slug: { contains: input.search, mode: 'insensitive' } },
      { id: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        planExpiresAt: true,
        _count: {
          select: {
            stores: true,
            orders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: input.pageSize,
    }),
    prisma.tenant.count({ where }),
  ]);

  const redis = getRedis();
  const keys = tenants.map((tenant) => 'reports:exports:' + tenant.id + ':' + monthKey);
  const rawCounts = keys.length > 0 ? await redis.mget(keys) : [];

  const items = tenants.map((tenant, idx) => {
    const used = Number(rawCounts[idx] || 0);
    const plan = (tenant.plan as PlanCode) || 'FREE';
    const limits = resolveReportExportLimit(plan);
    const exportsLeft = computeExportsLeft(limits.maxExportsPerMonth, used);

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      plan,
      planExpiresAt: tenant.planExpiresAt,
      storesCount: tenant._count.stores,
      ordersCount: tenant._count.orders,
      reportsLevel: limits.reportsLevel,
      allowExport: limits.allowExport,
      maxExportsPerMonth: limits.maxExportsPerMonth,
      exportsUsed: used,
      exportsLeft,
      blockedByLimit: limits.maxExportsPerMonth >= 0 && exportsLeft <= 0,
      usagePercent:
        limits.maxExportsPerMonth > 0
          ? Math.min(100, Math.round((used / limits.maxExportsPerMonth) * 100))
          : limits.maxExportsPerMonth === 0
          ? 0
          : null,
    };
  });

  const summary = items.reduce(
    (acc, row) => {
      acc.totalExportsUsed += Number(row.exportsUsed || 0);
      if (row.allowExport) acc.tenantsWithExport += 1;
      if (row.blockedByLimit) acc.blockedTenants += 1;
      return acc;
    },
    { totalExportsUsed: 0, tenantsWithExport: 0, blockedTenants: 0 }
  );

  return {
    monthKey,
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
    summary,
  };
}
export async function listSystemStores(input: { tenantId?: string; page: number; pageSize: number }) {
  const skip = (input.page - 1) * input.pageSize;
  const where: any = {};
  if (input.tenantId) where.tenantId = input.tenantId;

  const [items, total] = await Promise.all([
    prisma.store.findMany({
      where,
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: input.pageSize,
    }),
    prisma.store.count({ where }),
  ]);

  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export async function listPendingSystemInvoices() {
  return prisma.invoice.findMany({
    where: { status: 'PENDING', paymentRef: { not: null } },
    include: { tenant: { select: { id: true, name: true, slug: true, plan: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listSystemInvoices(input: {
  status?: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
  search?: string;
  page: number;
  pageSize: number;
}) {
  const skip = (input.page - 1) * input.pageSize;
  const where: any = {};

  if (input.status) where.status = input.status;
  if (input.search) {
    where.OR = [
      { tenant: { name: { contains: input.search, mode: 'insensitive' } } },
      { tenant: { slug: { contains: input.search, mode: 'insensitive' } } },
      { paymentRef: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { tenant: { select: { id: true, name: true, slug: true, plan: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: input.pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export async function confirmSystemInvoice(input: { id: string; confirmedBy: string }) {
  const invoice = await prisma.$transaction(async (tx: any) => {
    const inv = await tx.invoice.findUnique({ where: { id: input.id } });
    if (!inv || inv.status !== 'PENDING') {
      throw new Error('INVOICE_NOT_FOUND');
    }

    await tx.invoice.update({
      where: { id: input.id },
      data: { status: 'PAID', confirmedBy: input.confirmedBy, confirmedAt: new Date() },
    });

    await tx.tenant.update({
      where: { id: inv.tenantId },
      data: {
        plan: inv.plan,
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return inv;
  });

  await logSystemAction({
    action: 'INVOICE_CONFIRMED',
    actorId: input.confirmedBy,
    targetType: 'invoice',
    targetId: input.id,
    details: {
      invoiceId: input.id,
      tenantId: invoice.tenantId,
      plan: invoice.plan,
      amount: Number(invoice.amount),
      confirmedBy: input.confirmedBy,
    },
  });

  return invoice.plan;
}

export async function rejectSystemInvoice(input: { id: string; confirmedBy: string }) {
  const invoice = await prisma.$transaction(async (tx: any) => {
    const inv = await tx.invoice.findUnique({ where: { id: input.id } });
    if (!inv || inv.status !== 'PENDING') {
      throw new Error('INVOICE_NOT_FOUND');
    }

    await tx.invoice.update({
      where: { id: input.id },
      data: { status: 'CANCELLED', confirmedBy: input.confirmedBy, confirmedAt: new Date() },
    });

    return inv;
  });

  await logSystemAction({
    action: 'INVOICE_REJECTED',
    actorId: input.confirmedBy,
    targetType: 'invoice',
    targetId: input.id,
    details: {
      invoiceId: input.id,
      tenantId: invoice.tenantId,
      plan: invoice.plan,
      amount: Number(invoice.amount),
      rejectedBy: input.confirmedBy,
    },
  });
}

export async function listSystemUsers(input: {
  tenantId?: string;
  search?: string;
  role?: 'OWNER' | 'MANAGER' | 'OPERATOR';
  page: number;
  pageSize: number;
}) {
  const skip = (input.page - 1) * input.pageSize;
  const where: any = {};

  if (input.tenantId) where.tenantId = input.tenantId;
  if (input.role) where.role = input.role;
  if (input.search) {
    where.OR = [
      { email: { contains: input.search, mode: 'insensitive' } },
      { name: { contains: input.search, mode: 'insensitive' } },
      { tenant: { name: { contains: input.search, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        tenant: {
          select: { id: true, name: true, slug: true, plan: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: input.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export async function resetSystemUserPassword(input: {
  id: string;
  newPassword: string;
  changedBy: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.id } });
  if (!user) throw new Error('USER_NOT_FOUND');

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({ where: { id: input.id }, data: { passwordHash } });

  await prisma.systemAuditLog.create({
    data: {
      action: 'TENANT_PLAN_UPDATED',
      actorEmail: input.changedBy,
      targetType: 'tenant',
      targetId: user.tenantId,
      details: { event: 'USER_PASSWORD_RESET', userId: user.id, userEmail: user.email, changedBy: input.changedBy } as any,
    },
  });

  return { ok: true };
}

export async function getSystemRevenueTrend() {
  const now = new Date();
  const months: { year: number; month: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, label: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` });
  }
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const invoices = await prisma.invoice.findMany({
    where: { status: 'PAID', confirmedAt: { gte: sixMonthsAgo } },
    select: { amount: true, confirmedAt: true },
  });
  return months.map(({ year, month, label }) => {
    const revenue = invoices
      .filter(inv => {
        const d = inv.confirmedAt;
        return d != null && d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
      })
      .reduce((sum, inv) => sum + Number(inv.amount), 0);
    return { label, revenue };
  });
}

export async function getSystemTenantDetail(id: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      stores: { select: { id: true, name: true, isActive: true } },
      users: { select: { id: true, name: true, email: true, role: true, isActive: true } },
      _count: { select: { orders: true, products: true, customers: true } },
    },
  });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [monthlyOrders, totalRevenue, monthlyRevenue, invoicesCount] = await Promise.all([
    prisma.order.count({ where: { tenantId: id, createdAt: { gte: startOfMonth } } }),
    prisma.order.aggregate({ where: { tenantId: id, paymentStatus: 'PAID' }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { tenantId: id, paymentStatus: 'PAID', createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
    prisma.invoice.count({ where: { tenantId: id } }),
  ]);

  return {
    ...tenant,
    stats: {
      ordersTotal: tenant._count.orders,
      ordersMonth: monthlyOrders,
      productsTotal: tenant._count.products,
      customersTotal: tenant._count.customers,
      revenueTotal: Number(totalRevenue._sum.total || 0),
      revenueMonth: Number(monthlyRevenue._sum.total || 0),
      invoicesTotal: invoicesCount,
    },
  };
}

export async function blockSystemTenant(input: { id: string; changedBy: string }) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.id } });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');
  await prisma.store.updateMany({ where: { tenantId: input.id }, data: { isActive: false } });
  await prisma.user.updateMany({ where: { tenantId: input.id }, data: { isActive: false } });
  await logSystemAction({
    action: 'TENANT_PLAN_UPDATED', actorEmail: input.changedBy,
    targetType: 'tenant', targetId: input.id,
    details: { event: 'TENANT_BLOCKED', tenantName: tenant.name, changedBy: input.changedBy } as any,
  });
  return { ok: true };
}

export async function unblockSystemTenant(input: { id: string; changedBy: string }) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.id } });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');
  await prisma.store.updateMany({ where: { tenantId: input.id }, data: { isActive: true } });
  await prisma.user.updateMany({ where: { tenantId: input.id, role: { in: ['OWNER', 'MANAGER'] } }, data: { isActive: true } });
  await logSystemAction({
    action: 'TENANT_PLAN_UPDATED', actorEmail: input.changedBy,
    targetType: 'tenant', targetId: input.id,
    details: { event: 'TENANT_UNBLOCKED', tenantName: tenant.name, changedBy: input.changedBy } as any,
  });
  return { ok: true };
}

export async function createSystemInvoice(input: {
  tenantId: string;
  plan: 'FREE' | 'PRO' | 'BUSINESS';
  amount: number;
  paymentRef?: string;
  autoConfirm: boolean;
  changedBy: string;
}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: input.tenantId,
      plan: input.plan,
      amount: input.amount,
      status: 'PENDING',
      paymentRef: input.paymentRef || null,
      expiresAt,
    },
  });

  if (input.autoConfirm) {
    await confirmSystemInvoice({ id: invoice.id, confirmedBy: input.changedBy });
  }

  return invoice;
}

export async function impersonateTenantOwner(tenantId: string) {
  const owner = await prisma.user.findFirst({
    where: { tenantId, role: 'OWNER', isActive: true },
  });
  if (!owner) throw new Error('OWNER_NOT_FOUND');

  const payload = { userId: owner.id, tenantId: owner.tenantId, role: owner.role };
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload),
  ]);

  return { accessToken, refreshToken, user: { id: owner.id, email: owner.email, name: owner.name } };
}

/* ── Monitoring ─────────────────────────────────────────────── */

export async function getSystemBots() {
  const statuses = getBotStatuses();
  if (statuses.length === 0) return [];

  const storeIds = statuses.map((s) => s.storeId);
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, name: true, botUsername: true, isActive: true },
  });
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  return statuses.map((b) => {
    const store = storeMap.get(b.storeId);
    return {
      storeId: b.storeId,
      tenantId: b.tenantId,
      storeName: store?.name ?? b.storeId,
      username: b.username ?? store?.botUsername ?? null,
      isActive: store?.isActive ?? true,
    };
  });
}

export function getSystemErrors(limit = 100) {
  return getErrors(limit);
}

export async function getSystemStorage() {
  try {
    await ensureBucket();
    const s3 = getS3();
    const bucketName = process.env.S3_BUCKET || 'sellgram-files';

    let fileCount = 0;
    let totalBytes = 0;

    await new Promise<void>((resolve, reject) => {
      const stream = s3.listObjectsV2(bucketName, '', true);
      stream.on('data', (obj: any) => {
        fileCount++;
        totalBytes += obj.size || 0;
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    return {
      bucket: bucketName,
      fileCount,
      totalBytes,
      totalMb: Math.round(totalBytes / 1024 / 1024 * 10) / 10,
    };
  } catch {
    return { bucket: 'unknown', fileCount: 0, totalBytes: 0, totalMb: 0 };
  }
}

/* ── Announcements ──────────────────────────────────────────── */

interface AnnouncementRecord {
  id: string;
  message: string;
  filter: string;
  sentCount: number;
  failedCount: number;
  sentAt: number;
  sentBy: string;
}
const announcementHistory: AnnouncementRecord[] = [];

export async function sendSystemAnnouncement(
  message: string,
  filter: 'all' | 'pro' | 'business' | 'active',
  sentBy: string,
): Promise<{ sentCount: number; failedCount: number; skipped: number }> {
  const where: any = { role: 'OWNER', isActive: true, adminTelegramId: { not: null } };
  if (filter === 'pro') where.tenant = { plan: 'PRO' };
  else if (filter === 'business') where.tenant = { plan: 'BUSINESS' };
  else if (filter === 'active') {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    where.tenant = { orders: { some: { createdAt: { gte: cutoff } } } };
  }

  const owners = await prisma.user.findMany({
    where,
    select: { adminTelegramId: true, tenantId: true },
  });

  let sentCount = 0;
  let failedCount = 0;
  let skipped = 0;

  for (const owner of owners) {
    if (!owner.adminTelegramId) { skipped++; continue; }
    const ok = await sendMessageToOwner(owner.tenantId, owner.adminTelegramId as bigint, message);
    if (ok) sentCount++; else failedCount++;
  }

  announcementHistory.unshift({
    id: crypto.randomUUID(),
    message: message.slice(0, 500),
    filter,
    sentCount,
    failedCount,
    sentAt: Date.now(),
    sentBy,
  });
  if (announcementHistory.length > 50) announcementHistory.pop();

  return { sentCount, failedCount, skipped };
}

export function listSystemAnnouncements() {
  return announcementHistory;
}

// ─── Plan Config Management ────────────────────────────────────────────────────

export async function getSystemPlanConfigs() {
  return getAllPlanConfigs();
}

export async function updateSystemPlanConfig(
  code: PlanCode,
  patch: { price?: number; limits?: PlanLimitsOverride },
) {
  return updatePlanConfig(code, patch);
}

// ─── Expiring Tenants ─────────────────────────────────────────────────────────

export async function getExpiringTenants(days = 7) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const tenants = await prisma.tenant.findMany({
    where: {
      plan: { in: ['PRO', 'BUSINESS'] },
      planExpiresAt: { not: null, gte: now, lte: until },
    },
    select: {
      id: true, name: true, slug: true, plan: true, planExpiresAt: true,
      _count: { select: { stores: true, orders: true } },
    },
    orderBy: { planExpiresAt: 'asc' },
  });

  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    plan: t.plan,
    planExpiresAt: t.planExpiresAt,
    daysLeft: Math.ceil(((t.planExpiresAt as Date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    storesCount: t._count.stores,
  }));
}

export async function sendReminderToTenant(tenantId: string): Promise<{ sent: boolean; reason?: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, plan: true, planExpiresAt: true },
  });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: 'OWNER', isActive: true, adminTelegramId: { not: null } },
    select: { adminTelegramId: true },
  });
  if (!admin?.adminTelegramId) return { sent: false, reason: 'OWNER_NO_TELEGRAM' };

  const daysLeft = tenant.planExpiresAt
    ? Math.ceil((tenant.planExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;
  const expires = tenant.planExpiresAt?.toLocaleDateString('ru-RU') ?? '—';
  const message = `⚠️ <b>Напоминание о продлении</b>\n\nТариф <b>${tenant.plan}</b> для магазина «${tenant.name}» истекает через <b>${daysLeft} дн.</b> (${expires}).\n\nПродлите подписку в панели управления: Тарифы → Выбрать тариф → Оплатить.`;

  const { sendMessageToOwner } = await import('../../../bot/bot-manager.js');
  const sent = await sendMessageToOwner(tenantId, admin.adminTelegramId, message);
  return { sent };
}

// ─── Billing Payment Settings ─────────────────────────────────────────────────

const BILLING_SETTINGS_KEY = 'billing_payment_settings';

export async function getSystemBillingSettings() {
  const config = getConfig();
  const defaults = {
    bank: config.BILLING_BANK_NAME ?? '',
    account: config.BILLING_BANK_ACCOUNT ?? '',
    recipient: config.BILLING_RECIPIENT ?? '',
    inn: config.BILLING_INN ?? '',
    mfo: config.BILLING_MFO ?? '',
    note: config.BILLING_PAYMENT_NOTE ?? '',
    email: config.BILLING_EMAIL ?? '',
  };
  const setting = await prisma.systemSetting.findUnique({ where: { key: BILLING_SETTINGS_KEY } });
  if (setting?.value && typeof setting.value === 'object') {
    return { ...defaults, ...(setting.value as Record<string, string>) };
  }
  return defaults;
}

export async function updateSystemBillingSettings(patch: Record<string, string>) {
  const current = await getSystemBillingSettings();
  const updated = { ...current, ...patch };
  await prisma.systemSetting.upsert({
    where: { key: BILLING_SETTINGS_KEY },
    create: { key: BILLING_SETTINGS_KEY, value: updated as any },
    update: { value: updated as any },
  });
  return updated;
}

// ─── Soft Mode (no auto-downgrade) ────────────────────────────────────────────

const SOFT_MODE_KEY = 'billing_soft_mode';

export async function getSystemSoftMode(): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: SOFT_MODE_KEY } });
  if (setting?.value && typeof setting.value === 'object') {
    return Boolean((setting.value as any).enabled);
  }
  return false;
}

export async function updateSystemSoftMode(enabled: boolean): Promise<boolean> {
  await prisma.systemSetting.upsert({
    where: { key: SOFT_MODE_KEY },
    create: { key: SOFT_MODE_KEY, value: { enabled } as any },
    update: { value: { enabled } as any },
  });
  return enabled;
}

// ─── Manual Plan Extension ────────────────────────────────────────────────────

export async function extendTenantPlan(input: {
  id: string;
  plan: PlanCode;
  months: number;
  amount: number;
  note?: string;
  changedBy: string;
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.id },
    select: { id: true, name: true, plan: true, planExpiresAt: true },
  });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  // Compute new expiry: extend from current expiry (or now if expired/free)
  const base = tenant.planExpiresAt && tenant.planExpiresAt > new Date()
    ? tenant.planExpiresAt
    : new Date();
  const newExpiry = new Date(base);
  newExpiry.setMonth(newExpiry.getMonth() + input.months);

  await prisma.$transaction(async (tx: any) => {
    // Update tenant
    await tx.tenant.update({
      where: { id: input.id },
      data: { plan: input.plan as any, planExpiresAt: newExpiry },
    });

    // Create a pre-confirmed invoice if amount > 0
    if (input.amount > 0) {
      await tx.invoice.create({
        data: {
          tenantId: input.id,
          plan: input.plan as any,
          amount: input.amount,
          status: 'PAID' as any,
          paymentRef: 'manual',
          paymentNote: input.note || `Manual extension by ${input.changedBy}`,
          confirmedBy: input.changedBy,
          confirmedAt: new Date(),
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
    }

    // Audit log
    await tx.systemAuditLog.create({
      data: {
        action: 'TENANT_PLAN_UPDATED' as any,
        actorEmail: input.changedBy,
        targetType: 'tenant',
        targetId: input.id,
        details: {
          event: 'MANUAL_EXTENSION',
          tenantName: tenant.name,
          fromPlan: tenant.plan,
          toPlan: input.plan,
          months: input.months,
          amount: input.amount,
          newExpiry: newExpiry.toISOString(),
          note: input.note || null,
          changedBy: input.changedBy,
        } as any,
      },
    });
  });

  return { plan: input.plan, planExpiresAt: newExpiry };
}
