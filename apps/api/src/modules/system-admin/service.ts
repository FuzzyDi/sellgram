import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma.js';
import { signSystemToken } from '../../lib/system-jwt.js';
import { getConfig } from '../../config/index.js';
import { getRedis } from '../../lib/redis.js';
import { PLANS, type PlanCode, type ReportsLevel } from '@sellgram/shared';
const SUBSCRIPTION_REMINDER_SETTINGS_KEY = 'subscription_reminders';
function getMonthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function resolveReportExportLimit(plan: PlanCode) {
  const planCfg = PLANS[plan] || PLANS.FREE;
  const allowExport = Boolean(planCfg.limits.allowReportExport);
  const fallback = plan === 'BUSINESS' ? -1 : plan === 'PRO' ? 50 : 0;
  const maxExportsPerMonth = Number((planCfg.limits as any).maxExportsPerMonth ?? fallback);
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

  const [tenants, activeStores, pendingInvoices, monthlyOrders, pendingAmountAgg, paidInvoicesMonth, paidRevenueMonthAgg] = await Promise.all([
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
  ]);

  return {
    tenants,
    activeStores,
    pendingInvoices,
    monthlyOrders,
    pendingAmount: Number(pendingAmountAgg._sum.amount || 0),
    paidInvoicesMonth,
    paidRevenueMonth: Number(paidRevenueMonthAgg._sum.amount || 0),
  };
}

export async function getSystemHealth() {
  const startedAt = Date.now();
  let dbOk = true;

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch {
    dbOk = false;
  }

  const dbLatencyMs = Date.now() - startedAt;

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
    runtime: {
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node: process.version,
    },
    counters: {
      tenants,
      activeStores,
      pendingInvoices,
    },
    subscriptionReminders: {
      enabled: reminder.enabled,
      days: reminder.days,
    },
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
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({
    where: { id: input.id },
    data: { passwordHash },
  });

  await prisma.systemAuditLog.create({
    data: {
      action: 'TENANT_PLAN_UPDATED',
      actorEmail: input.changedBy,
      targetType: 'tenant',
      targetId: user.tenantId,
      details: {
        event: 'USER_PASSWORD_RESET',
        userId: user.id,
        userEmail: user.email,
        changedBy: input.changedBy,
      } as any,
    },
  });

  return { ok: true };
}
