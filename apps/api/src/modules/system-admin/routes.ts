import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifySystemToken, type SystemJwtPayload } from '../../lib/system-jwt.js';
import {
  systemAdminIdParamSchema,
  systemAdminLoginSchema,
  systemAdminStoreListQuerySchema,
  systemAdminTenantListQuerySchema,
  systemAdminUpdateTenantPlanSchema,
} from './dto.js';
import {
  confirmSystemInvoice,
  getSystemDashboard,
  listPendingSystemInvoices,
  listSystemStores,
  listSystemTenants,
  loginSystemAdmin,
  rejectSystemInvoice,
  updateSystemTenantPlan,
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
  fastify.post('/auth/login', async (request, reply) => {
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
      const data = await updateSystemTenantPlan({ id, ...body });
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

  fastify.get('/invoices/pending', { preHandler: [authenticateSystem] }, async () => {
    const data = await listPendingSystemInvoices();
    return { success: true, data };
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
}
