import { FastifyInstance } from 'fastify';
import prisma from '../../lib/prisma.js';
import {
  createPaymentMethodSchema,
  paymentMethodParamsSchema,
  paymentMethodStoreParamsSchema,
  updatePaymentMethodSchema,
} from './payment-methods.dto.js';
import {
  archiveStorePaymentMethod,
  createStorePaymentMethod,
  ensureStoreForTenant,
  listStorePaymentMethods,
  updateStorePaymentMethod,
} from './payment-methods.service.js';

function mapPaymentMethodError(err: unknown) {
  if (err instanceof Error) {
    if (err.message === 'STORE_NOT_FOUND') {
      return { status: 404, error: 'Store not found' };
    }
    if (err.message === 'PAYMENT_METHOD_NOT_FOUND') {
      return { status: 404, error: 'Payment method not found' };
    }
    return { status: 400, error: err.message };
  }

  return { status: 400, error: 'Bad request' };
}

export default async function paymentMethodRoutes(fastify: FastifyInstance) {
  fastify.get('/stores/:id/payment-methods', async (request, reply) => {
    try {
      const { id } = paymentMethodStoreParamsSchema.parse(request.params);
      await ensureStoreForTenant(prisma, { tenantId: request.tenantId!, storeId: id });

      const data = await listStorePaymentMethods(prisma, {
        tenantId: request.tenantId!,
        storeId: id,
      });

      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapPaymentMethodError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.post('/stores/:id/payment-methods', async (request, reply) => {
    try {
      const { id } = paymentMethodStoreParamsSchema.parse(request.params);
      const body = createPaymentMethodSchema.parse(request.body);

      await ensureStoreForTenant(prisma, { tenantId: request.tenantId!, storeId: id });

      const data = await createStorePaymentMethod(prisma, {
        tenantId: request.tenantId!,
        storeId: id,
        data: body,
      });
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapPaymentMethodError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.patch('/stores/:id/payment-methods/:methodId', async (request, reply) => {
    try {
      const { id, methodId } = paymentMethodParamsSchema.parse(request.params);
      const body = updatePaymentMethodSchema.parse(request.body);

      const data = await updateStorePaymentMethod(prisma, {
        tenantId: request.tenantId!,
        storeId: id,
        methodId,
        data: body,
      });
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapPaymentMethodError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.delete('/stores/:id/payment-methods/:methodId', async (request, reply) => {
    try {
      const { id, methodId } = paymentMethodParamsSchema.parse(request.params);

      await archiveStorePaymentMethod(prisma, {
        tenantId: request.tenantId!,
        storeId: id,
        methodId,
      });
      return { success: true, message: 'Payment method archived' };
    } catch (err: unknown) {
      const mapped = mapPaymentMethodError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });
}
