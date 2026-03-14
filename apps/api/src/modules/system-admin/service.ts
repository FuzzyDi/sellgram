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

async function logSystemAction(action: string, meta: Record<string, unknown>) {
  // Can be moved to a dedicated audit table later without changing API contract.
  console.info('[system-admin]', action, meta);
}

export async function getSystemDashboard() {
  const [tenants, activeStores, pendingInvoices, monthlyOrders] = await Promise.all([
    prisma.tenant.count(),
    prisma.store.count({ where: { isActive: true } }),
    prisma.invoice.count({ where: { status: 'PENDING', paymentRef: { not: null } } }),
    prisma.order.count({
      where: {
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ]);

  return { tenants, activeStores, pendingInvoices, monthlyOrders };
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

export async function listSystemActivity(input: { limit: number }) {
  const [invoiceEvents, recentTenants] = await Promise.all([
    prisma.invoice.findMany({
      where: { confirmedAt: { not: null } },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: { confirmedAt: 'desc' },
      take: input.limit,
    }),
    prisma.tenant.findMany({
      orderBy: { updatedAt: 'desc' },
      take: input.limit,
      select: { id: true, name: true, slug: true, plan: true, updatedAt: true },
    }),
  ]);

  return [
    ...invoiceEvents.map((inv) => ({
      id: `invoice:${inv.id}`,
      type: inv.status === 'PAID' ? 'invoice_confirmed' : 'invoice_rejected',
      at: inv.confirmedAt,
      actor: inv.confirmedBy || 'system',
      message: inv.status === 'PAID' ? 'Invoice confirmed' : 'Invoice rejected',
      context: {
        tenantId: inv.tenantId,
        tenantName: inv.tenant?.name,
        invoiceId: inv.id,
        plan: inv.plan,
        amount: Number(inv.amount),
      },
    })),
    ...recentTenants.map((tenant) => ({
      id: `tenant:${tenant.id}:${tenant.updatedAt.toISOString()}`,
      type: 'tenant_updated',
      at: tenant.updatedAt,
      actor: 'system',
      message: 'Tenant updated',
      context: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        plan: tenant.plan,
      },
    })),
  ]
    .filter((item) => Boolean(item.at))
    .sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime())
    .slice(0, input.limit);
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

  await logSystemAction('tenant.plan.updated', {
    tenantId: input.id,
    plan: input.plan,
    planExpiresAt: input.planExpiresAt || null,
    changedBy: input.changedBy || 'system',
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

  await logSystemAction('invoice.confirmed', {
    invoiceId: input.id,
    tenantId: invoice.tenantId,
    plan: invoice.plan,
    amount: Number(invoice.amount),
    confirmedBy: input.confirmedBy,
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

  await logSystemAction('invoice.rejected', {
    invoiceId: input.id,
    tenantId: invoice.tenantId,
    plan: invoice.plan,
    amount: Number(invoice.amount),
    rejectedBy: input.confirmedBy,
  });
}
