import { FastifyInstance } from 'fastify';
import { permissionGuard } from '../../plugins/permission-guard.js';
import {
  subscriptionInvoicePayBodySchema,
  subscriptionInvoicePayParamsSchema,
  subscriptionUpgradeSchema,
} from './dto.js';
import {
  getSubscriptionPlans,
  getTenantSubscription,
  listTenantInvoices,
  submitInvoicePayment,
  upgradeTenantPlan,
} from './service.js';

export default async function subscriptionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/subscription', async (request, reply) => {
    try {
      const data = await getTenantSubscription(request.tenantId!);
      return { success: true, data };
    } catch (err: any) {
      if (err.message === 'TENANT_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Tenant not found' });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/subscription/plans', async () => {
    return { success: true, data: getSubscriptionPlans() };
  });

  fastify.post('/subscription/upgrade', {
    preHandler: [permissionGuard('manageBilling')],
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    try {
      const body = subscriptionUpgradeSchema.parse(request.body);
      const data = await upgradeTenantPlan({ tenantId: request.tenantId!, plan: body.plan });

      if (body.plan === 'FREE') {
        return { success: true, message: 'Plan switched to FREE' };
      }

      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/subscription/invoices', async (request) => {
    const data = await listTenantInvoices(request.tenantId!);
    return { success: true, data };
  });

  fastify.patch('/subscription/invoices/:id/pay', { preHandler: [permissionGuard('manageBilling')] }, async (request, reply) => {
    try {
      const { id } = subscriptionInvoicePayParamsSchema.parse(request.params);
      const body = subscriptionInvoicePayBodySchema.parse(request.body);

      await submitInvoicePayment({
        tenantId: request.tenantId!,
        id,
        paymentRef: body.paymentRef,
        paymentNote: body.paymentNote,
      });

      return { success: true, message: 'Payment details submitted. Waiting for moderation.' };
    } catch (err: any) {
      if (err.message === 'INVOICE_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Invoice not found' });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/subscription/admin/invoices', async () => {
    return { success: false, error: 'Use /api/system-admin/invoices/pending' };
  });

  fastify.patch('/subscription/admin/invoices/:id/confirm', async (_request, reply) => {
    return reply.status(403).send({ success: false, error: 'Use /api/system-admin/invoices/:id/confirm' });
  });

  fastify.patch('/subscription/admin/invoices/:id/reject', async (_request, reply) => {
    return reply.status(403).send({ success: false, error: 'Use /api/system-admin/invoices/:id/reject' });
  });
}

