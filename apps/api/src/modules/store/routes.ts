import { FastifyInstance } from 'fastify';
import { planGuard } from '../../plugins/plan-guard.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { writeAuditLog } from '../../lib/audit.js';
import paymentMethodRoutes from '../payments-integration/payment-methods.routes.js';
import { createStoreSchema, storeIdParamSchema, updateStoreSchema } from './dto.js';
import {
  activateTenantStoreBot,
  checkTenantStoreBotConnection,
  createTenantStore,
  deleteTenantStore,
  getTenantStore,
  listTenantStores,
  StoreServiceError,
  updateTenantStore,
} from './service.js';
import { sendWelcomeMessage } from '../../bot/bot-manager.js';

function mapStoreError(err: unknown) {
  if (err instanceof StoreServiceError) {
    if (err.code === 'STORE_NOT_FOUND') return { status: 404, error: 'Store not found' };
    if (err.code === 'STORE_INACTIVE') return { status: 400, error: 'Store is inactive' };
    if (err.code === 'WEBHOOK_BASE_URL_NOT_CONFIGURED') return { status: 400, error: 'Webhook base URL is not configured' };
    if (err.code === 'STORE_HAS_ORDERS') return { status: 409, error: 'Store has orders and cannot be deleted' };
    if (err.code === 'LAST_STORE_CANNOT_BE_DELETED') return { status: 409, error: 'At least one store must remain' };
  }

  if (err instanceof Error) return { status: 400, error: err.message };
  return { status: 400, error: 'Bad request' };
}

export default async function storeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  await fastify.register(paymentMethodRoutes);

  fastify.get('/stores', async (request) => {
    const data = await listTenantStores(request.tenantId!);
    return { success: true, data };
  });

  fastify.post('/stores', {
    preHandler: [permissionGuard('manageSettings'), planGuard('maxStores')],
  }, async (request, reply) => {
    try {
      const body = createStoreSchema.parse(request.body);
      const data = await createTenantStore(request.tenantId!, body);
      writeAuditLog({ tenantId: request.tenantId!, actorId: request.user?.userId, action: 'store.create', targetId: data.id, details: { name: data.name } });
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapStoreError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.get('/stores/:id', async (request, reply) => {
    try {
      const { id } = storeIdParamSchema.parse(request.params);
      const data = await getTenantStore(request.tenantId!, id);
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapStoreError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.patch('/stores/:id', { preHandler: [permissionGuard('manageSettings')] }, async (request, reply) => {
    try {
      const { id } = storeIdParamSchema.parse(request.params);
      const body = updateStoreSchema.parse(request.body);
      await updateTenantStore(request.tenantId!, id, body);
      writeAuditLog({ tenantId: request.tenantId!, actorId: request.user?.userId, action: 'store.update', targetId: id });
      return { success: true, message: 'Store updated' };
    } catch (err: unknown) {
      const mapped = mapStoreError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.delete('/stores/:id', { preHandler: [permissionGuard('manageSettings')] }, async (request, reply) => {
    try {
      const { id } = storeIdParamSchema.parse(request.params);
      await deleteTenantStore(request.tenantId!, id);
      writeAuditLog({ tenantId: request.tenantId!, actorId: request.user?.userId, action: 'store.delete', targetId: id });
      return { success: true, message: 'Store deleted' };
    } catch (err: unknown) {
      const mapped = mapStoreError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.get('/stores/:id/check-bot', async (request, reply) => {
    try {
      const { id } = storeIdParamSchema.parse(request.params);
      const data = await checkTenantStoreBotConnection(request.tenantId!, id);
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapStoreError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.post('/onboarding/complete', async (request, reply) => {
    sendWelcomeMessage(request.tenantId!).catch(() => {/* non-fatal */});
    return { success: true };
  });

  fastify.post('/stores/:id/activate', { preHandler: [permissionGuard('manageSettings')] }, async (request, reply) => {
    try {
      const { id } = storeIdParamSchema.parse(request.params);
      const data = await activateTenantStoreBot(request.tenantId!, id);
      writeAuditLog({ tenantId: request.tenantId!, actorId: request.user?.userId, action: 'store.activate', targetId: id });
      return {
        success: true,
        message: 'Bot activated and webhook configured',
        data,
      };
    } catch (err: unknown) {
      const mapped = mapStoreError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });
}
