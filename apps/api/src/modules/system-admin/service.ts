import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma.js';
import { signSystemToken } from '../../lib/system-jwt.js';

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
      details: input.details || {},
    },
  });
}

export async function getSystemDashboard() {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

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
  const invoice = await prisma.invoice.findUnique({ where: { id: input.id } });
  if (!invoice || invoice.status !== 'PENDING') {
    throw new Error('INVOICE_NOT_FOUND');
  }

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: input.id },
      data: {
        status: 'PAID',
        confirmedBy: input.confirmedBy,
        confirmedAt: new Date(),
      },
    }),
    prisma.tenant.update({
      where: { id: invoice.tenantId },
      data: {
        plan: invoice.plan,
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

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
  const invoice = await prisma.invoice.findUnique({ where: { id: input.id } });
  if (!invoice || invoice.status !== 'PENDING') {
    throw new Error('INVOICE_NOT_FOUND');
  }

  await prisma.invoice.update({
    where: { id: input.id },
    data: { status: 'CANCELLED', confirmedBy: input.confirmedBy, confirmedAt: new Date() },
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
