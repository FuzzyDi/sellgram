import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifySystemToken, type SystemJwtPayload } from '../../lib/system-jwt.js';
import {
  systemAdminActivityQuerySchema,
  systemAdminCreateInvoiceSchema,
  systemAdminIdParamSchema,
  systemAdminInvoiceListQuerySchema,
  systemAdminLoginSchema,
  systemAdminReminderSettingsUpdateSchema,
  systemAdminReportsUsageQuerySchema,
  systemAdminResetUserPasswordSchema,
  systemAdminStoreListQuerySchema,
  systemAdminTenantListQuerySchema,
  systemAdminUpdateTenantPlanSchema,
  systemAdminUserListQuerySchema,
} from './dto.js';
import {
  blockSystemTenant,
  confirmSystemInvoice,
  createSystemInvoice,
  getSystemDashboard,
  getSystemHealth,
  getSystemRevenueTrend,
  getSystemSubscriptionReminderSettings,
  getSystemTenantDetail,
  impersonateTenantOwner,
  listPendingSystemInvoices,
  listSystemActivity,
  listSystemReportsUsage,
  listSystemInvoices,
  listSystemStores,
  listSystemTenants,
  listSystemUsers,
  loginSystemAdmin,
  rejectSystemInvoice,
  resetSystemUserPassword,
  unblockSystemTenant,
  updateSystemSubscriptionReminderSettings,
  updateSystemTenantPlan,
  getSystemBots,
  getSystemErrors,
  getSystemStorage,
  sendSystemAnnouncement,
  listSystemAnnouncements,
} from './service.js';
declare module 'fastify' {
  interface FastifyRequest {
    systemAdmin?: SystemJwtPayload;
  }
}

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
  fastify.post('/auth/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
      },
    },
  }, async (request, reply) => {
    try {
      const body = systemAdminLoginSchema.parse(request.body);
      const data = await loginSystemAdmin(body);
      return { success: true, data };
    } catch (err: any) {
      if (err.message === 'INVALID_CREDENTIALS') {
        return reply.status(401).send({ success: false, error: 'Invalid credentials' });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/dashboard', { preHandler: [authenticateSystem] }, async () => {
    const data = await getSystemDashboard();
    return { success: true, data };
  });

  fastify.get('/health', { preHandler: [authenticateSystem] }, async () => {
    const data = await getSystemHealth();
    return { success: true, data };
  });

  fastify.get('/settings/reminders', { preHandler: [authenticateSystem] }, async () => {
    const data = await getSystemSubscriptionReminderSettings();
    return { success: true, data };
  });

  fastify.patch('/settings/reminders', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const body = systemAdminReminderSettingsUpdateSchema.parse(request.body);
      const data = await updateSystemSubscriptionReminderSettings(body);
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/activity', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const query = systemAdminActivityQuerySchema.parse(request.query);
      const data = await listSystemActivity(query);
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/tenants', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const query = systemAdminTenantListQuerySchema.parse(request.query);
      const data = await listSystemTenants(query);
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/tenants/:id/plan', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = systemAdminIdParamSchema.parse(request.params);
      const body = systemAdminUpdateTenantPlanSchema.parse(request.body);
      const data = await updateSystemTenantPlan({ id, ...body, changedBy: request.systemAdmin?.email || 'system' });
      return { success: true, data };
    } catch (err: any) {
      if (err.message === 'TENANT_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Tenant not found' });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/stores', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const query = systemAdminStoreListQuerySchema.parse(request.query);
      const data = await listSystemStores(query);
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/users', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const query = systemAdminUserListQuerySchema.parse(request.query);
      const data = await listSystemUsers(query);
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.post('/users/:id/reset-password', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = systemAdminIdParamSchema.parse(request.params);
      const body = systemAdminResetUserPasswordSchema.parse(request.body);
      const data = await resetSystemUserPassword({
        id,
        newPassword: body.newPassword,
        changedBy: request.systemAdmin?.email || 'system',
      });
      return { success: true, data };
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/reports/usage', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const query = systemAdminReportsUsageQuerySchema.parse(request.query);
      const data = await listSystemReportsUsage(query);
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/invoices/pending', { preHandler: [authenticateSystem] }, async () => {
    const data = await listPendingSystemInvoices();
    return { success: true, data };
  });

  fastify.get('/invoices', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const query = systemAdminInvoiceListQuerySchema.parse(request.query);
      const data = await listSystemInvoices(query);
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/invoices/:id/confirm', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = systemAdminIdParamSchema.parse(request.params);
      const plan = await confirmSystemInvoice({ id, confirmedBy: request.systemAdmin?.adminId || 'system' });
      return { success: true, message: `Plan ${plan} activated` };
    } catch (err: any) {
      if (err.message === 'INVOICE_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Invoice not found' });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/invoices/:id/reject', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = systemAdminIdParamSchema.parse(request.params);
      await rejectSystemInvoice({ id, confirmedBy: request.systemAdmin?.adminId || 'system' });
      return { success: true, message: 'Invoice rejected' };
    } catch (err: any) {
      if (err.message === 'INVOICE_NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Invoice not found' });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.post('/invoices', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const body = systemAdminCreateInvoiceSchema.parse(request.body);
      const data = await createSystemInvoice({ ...body, changedBy: request.systemAdmin?.email || 'system' });
      return { success: true, data };
    } catch (err: any) {
      if (err.message === 'TENANT_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Tenant not found' });
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.get('/revenue-trend', { preHandler: [authenticateSystem] }, async () => {
    const data = await getSystemRevenueTrend();
    return { success: true, data };
  });

  fastify.get('/tenants/:id', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = systemAdminIdParamSchema.parse(request.params);
      const data = await getSystemTenantDetail(id);
      return { success: true, data };
    } catch (err: any) {
      if (err.message === 'TENANT_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Tenant not found' });
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/tenants/:id/block', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = systemAdminIdParamSchema.parse(request.params);
      const data = await blockSystemTenant({ id, changedBy: request.systemAdmin?.email || 'system' });
      return { success: true, data };
    } catch (err: any) {
      if (err.message === 'TENANT_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Tenant not found' });
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/tenants/:id/unblock', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = systemAdminIdParamSchema.parse(request.params);
      const data = await unblockSystemTenant({ id, changedBy: request.systemAdmin?.email || 'system' });
      return { success: true, data };
    } catch (err: any) {
      if (err.message === 'TENANT_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Tenant not found' });
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Monitoring
  fastify.get('/bots', { preHandler: [authenticateSystem] }, async () => {
    const data = await getSystemBots();
    return { success: true, data };
  });

  fastify.get('/errors', { preHandler: [authenticateSystem] }, async (request) => {
    const limit = Math.min(Number((request.query as any).limit) || 100, 300);
    const data = getSystemErrors(limit);
    return { success: true, data };
  });

  fastify.get('/storage', { preHandler: [authenticateSystem] }, async () => {
    const data = await getSystemStorage();
    return { success: true, data };
  });

  // Announcements
  fastify.post('/announcements', { preHandler: [authenticateSystem] }, async (request, reply) => {
    const body = request.body as any;
    const message = String(body?.message || '').trim();
    const filter = ['all', 'pro', 'business', 'active'].includes(body?.filter) ? body.filter : 'all';
    if (!message) return reply.status(400).send({ success: false, error: 'message required' });
    const data = await sendSystemAnnouncement(message, filter, request.systemAdmin?.email || 'system');
    return { success: true, data };
  });

  fastify.get('/announcements', { preHandler: [authenticateSystem] }, async () => {
    return { success: true, data: listSystemAnnouncements() };
  });

  fastify.post('/tenants/:id/impersonate', { preHandler: [authenticateSystem] }, async (request, reply) => {
    try {
      const { id } = systemAdminIdParamSchema.parse(request.params);
      const data = await impersonateTenantOwner(id);
      return { success: true, data };
    } catch (err: any) {
      if (err.message === 'TENANT_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Tenant not found' });
      if (err.message === 'OWNER_NOT_FOUND') return reply.status(404).send({ success: false, error: 'No active owner found for this tenant' });
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
}
