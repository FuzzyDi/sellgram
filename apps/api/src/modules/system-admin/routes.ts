import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma.js';
import { getConfig } from '../../config/index.js';
import { signSystemToken, verifySystemToken, type SystemJwtPayload } from '../../lib/system-jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    systemAdmin?: SystemJwtPayload;
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function authenticateSystem(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }

  try {
    const token = authHeader.slice(7);
    request.systemAdmin = await verifySystemToken(token);
  } catch {
    return reply.status(401).send({ success: false, error: 'Invalid system token' });
  }
}

export default async function systemAdminRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);
      const config = getConfig();

      // Prefer DB-backed system admins
      const admin = await prisma.systemAdmin.findUnique({ where: { email: body.email } });
      if (admin?.isActive) {
        const valid = await bcrypt.compare(body.password, admin.passwordHash);
        if (!valid) return reply.status(401).send({ success: false, error: 'Invalid credentials' });

        const token = await signSystemToken({
          type: 'system_admin',
          adminId: admin.id,
          email: admin.email,
        });
        return { success: true, data: { token, admin: { id: admin.id, email: admin.email, name: admin.name } } };
      }

      // Fallback to env bootstrap credentials
      if (
        config.SYSTEM_ADMIN_EMAIL &&
        config.SYSTEM_ADMIN_PASSWORD &&
        body.email === config.SYSTEM_ADMIN_EMAIL &&
        body.password === config.SYSTEM_ADMIN_PASSWORD
      ) {
        const token = await signSystemToken({
          type: 'system_admin',
          adminId: 'env-admin',
          email: body.email,
        });
        return { success: true, data: { token, admin: { id: 'env-admin', email: body.email, name: 'System Admin' } } };
      }

      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/dashboard', { preHandler: [authenticateSystem] }, async () => {
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

    return {
      success: true,
      data: { tenants, activeStores, pendingInvoices, monthlyOrders },
    };
  });

  fastify.get('/tenants', { preHandler: [authenticateSystem] }, async (request) => {
    const { page = 1, pageSize = 25, search } = request.query as any;
    const skip = (Number(page) - 1) * Number(pageSize);
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
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
        take: Number(pageSize),
      }),
      prisma.tenant.count({ where }),
    ]);

    return {
      success: true,
      data: { items, total, page: Number(page), pageSize: Number(pageSize), totalPages: Math.ceil(total / Number(pageSize)) },
    };
  });

  fastify.patch('/tenants/:id/plan', { preHandler: [authenticateSystem] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      plan: z.enum(['FREE', 'PRO', 'BUSINESS']),
      planExpiresAt: z.string().datetime().optional(),
    }).parse(request.body);

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return reply.status(404).send({ success: false, error: 'Tenant not found' });

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        plan: body.plan,
        planExpiresAt: body.planExpiresAt ? new Date(body.planExpiresAt) : null,
      },
    });
    return { success: true, data: updated };
  });

  fastify.get('/stores', { preHandler: [authenticateSystem] }, async (request) => {
    const { tenantId, page = 1, pageSize = 50 } = request.query as any;
    const skip = (Number(page) - 1) * Number(pageSize);
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;

    const [items, total] = await Promise.all([
      prisma.store.findMany({
        where,
        include: { tenant: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(pageSize),
      }),
      prisma.store.count({ where }),
    ]);
    return {
      success: true,
      data: { items, total, page: Number(page), pageSize: Number(pageSize), totalPages: Math.ceil(total / Number(pageSize)) },
    };
  });

  fastify.get('/invoices/pending', { preHandler: [authenticateSystem] }, async () => {
    const invoices = await prisma.invoice.findMany({
      where: { status: 'PENDING', paymentRef: { not: null } },
      include: { tenant: { select: { id: true, name: true, slug: true, plan: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: invoices };
  });

  fastify.patch('/invoices/:id/confirm', { preHandler: [authenticateSystem] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice || invoice.status !== 'PENDING') {
      return reply.status(404).send({ success: false, error: 'Invoice not found' });
    }

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id },
        data: {
          status: 'PAID',
          confirmedBy: request.systemAdmin?.adminId || 'system',
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

    return { success: true, message: `Plan ${invoice.plan} activated` };
  });

  fastify.patch('/invoices/:id/reject', { preHandler: [authenticateSystem] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice || invoice.status !== 'PENDING') {
      return reply.status(404).send({ success: false, error: 'Invoice not found' });
    }

    await prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED', confirmedBy: request.systemAdmin?.adminId || 'system', confirmedAt: new Date() },
    });
    return { success: true, message: 'Invoice rejected' };
  });
}
