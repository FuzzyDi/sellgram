import { FastifyInstance } from 'fastify';
import prisma from '../../lib/prisma.js';
import { PLANS, type PlanCode } from '@sellgram/shared';
import { getConfig } from '../../config/index.js';

export default async function subscriptionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  const config = getConfig();

  const bankDetails = {
    bank: config.BILLING_BANK_NAME,
    account: config.BILLING_BANK_ACCOUNT,
    recipient: config.BILLING_RECIPIENT,
    inn: config.BILLING_INN,
    mfo: config.BILLING_MFO,
    note: config.BILLING_PAYMENT_NOTE,
    email: config.BILLING_EMAIL,
  };

  fastify.get('/subscription', async (request) => {
    const tenantId = request.tenantId!;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return { success: false, error: 'Tenant not found' };

    const plan = PLANS[tenant.plan as PlanCode];
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [storesCount, productsCount, ordersThisMonth, zonesCount] = await Promise.all([
      prisma.store.count({ where: { tenantId } }),
      prisma.product.count({ where: { tenantId, isActive: true } }),
      prisma.order.count({ where: { tenantId, createdAt: { gte: startOfMonth } } }),
      prisma.deliveryZone.count({ where: { tenantId, isActive: true } }),
    ]);

    return {
      success: true,
      data: {
        plan: tenant.plan,
        planDetails: plan,
        planExpiresAt: tenant.planExpiresAt,
        usage: {
          stores: { current: storesCount, limit: plan.limits.maxStores },
          products: { current: productsCount, limit: plan.limits.maxProducts },
          ordersThisMonth: { current: ordersThisMonth, limit: plan.limits.maxOrdersPerMonth },
          deliveryZones: { current: zonesCount, limit: plan.limits.maxDeliveryZones },
        },
      },
    };
  });

  fastify.get('/subscription/plans', async () => {
    return { success: true, data: PLANS };
  });

  fastify.post('/subscription/upgrade', async (request, reply) => {
    const { plan } = request.body as { plan: string };
    if (!['FREE', 'PRO', 'BUSINESS'].includes(plan)) {
      return reply.status(400).send({ success: false, error: 'Invalid plan' });
    }

    const planData = PLANS[plan as PlanCode];

    if (plan === 'FREE') {
      await prisma.tenant.update({
        where: { id: request.tenantId! },
        data: { plan: 'FREE', planExpiresAt: null },
      });
      return { success: true, message: 'Тариф изменен на бесплатный' };
    }

    const existing = await prisma.invoice.findFirst({
      where: { tenantId: request.tenantId!, status: 'PENDING', plan: plan as any },
    });
    if (existing) {
      return { success: true, data: { invoice: existing, bankDetails } };
    }

    const invoice = await prisma.invoice.create({
      data: {
        tenantId: request.tenantId!,
        plan: plan as any,
        amount: planData.price,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    return {
      success: true,
      data: {
        invoice,
        bankDetails,
        message: `Переведите ${planData.price.toLocaleString()} сум и укажите номер транзакции.`,
      },
    };
  });

  fastify.get('/subscription/invoices', async (request) => {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: request.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return { success: true, data: invoices };
  });

  fastify.patch('/subscription/invoices/:id/pay', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { paymentRef, paymentNote } = request.body as { paymentRef: string; paymentNote?: string };

    if (!paymentRef) {
      return reply.status(400).send({ success: false, error: 'Укажите номер транзакции' });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: request.tenantId!, status: 'PENDING' },
    });
    if (!invoice) {
      return reply.status(404).send({ success: false, error: 'Счет не найден' });
    }

    await prisma.invoice.update({
      where: { id },
      data: { paymentRef, paymentNote },
    });

    return { success: true, message: 'Данные оплаты сохранены. Ожидайте подтверждения.' };
  });

  fastify.get('/subscription/admin/invoices', async () => {
    return { success: false, error: 'Use /api/system/invoices/pending' };
  });

  fastify.patch('/subscription/admin/invoices/:id/confirm', async (_request, reply) => {
    return reply.status(403).send({ success: false, error: 'Use /api/system/invoices/:id/confirm' });
  });

  fastify.patch('/subscription/admin/invoices/:id/reject', async (_request, reply) => {
    return reply.status(403).send({ success: false, error: 'Use /api/system/invoices/:id/reject' });
  });
}
