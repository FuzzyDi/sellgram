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

export async function listSystemTenants(input: { page: number; pageSize: number; search?: string }) {
  const skip = (input.page - 1) * input.pageSize;
  const where: any = {};
  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { slug: { contains: input.search, mode: 'insensitive' } },
    ];
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

export async function updateSystemTenantPlan(input: { id: string; plan: 'FREE' | 'PRO' | 'BUSINESS'; planExpiresAt?: string }) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.id } });
  if (!tenant) {
    throw new Error('TENANT_NOT_FOUND');
  }

  return prisma.tenant.update({
    where: { id: input.id },
    data: {
      plan: input.plan,
      planExpiresAt: input.planExpiresAt ? new Date(input.planExpiresAt) : null,
    },
  });
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
}
