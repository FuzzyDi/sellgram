import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * POS Sync API skeleton — see docs/SBGCLOUD_ARCHITECTURE.md.
 *
 * None of the backing models (PosDevice, SaleEvent, FiscalReceipt, ...) exist
 * yet, so every endpoint here is a stub that returns 501 Not Implemented.
 * This module exists so the route surface, prefix and naming are settled
 * ahead of the real implementation — it must not gain any business logic,
 * database access, or auth requirements beyond what's needed to keep that
 * contract additive and non-breaking for Sellgram Commerce.
 *
 * Do not wire this up to Order/Product/prisma directly from here — POS sale
 * data is intentionally kept out of the existing commerce domain model
 * (docs/SBGCLOUD_ARCHITECTURE.md §2, §12).
 */

function notImplemented(reply: FastifyReply, feature: string) {
  return reply.status(501).send({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message: `POS Sync API: ${feature} is not implemented yet`,
  });
}

export default async function posSyncRoutes(fastify: FastifyInstance) {
  fastify.post('/pos/v1/activate', async (_request, reply) => {
    return notImplemented(reply, 'device activation');
  });

  fastify.post('/pos/v1/heartbeat', async (_request, reply) => {
    return notImplemented(reply, 'device heartbeat');
  });

  fastify.get('/pos/v1/catalog/snapshot', async (_request, reply) => {
    return notImplemented(reply, 'catalog snapshot');
  });

  fastify.get('/pos/v1/settings', async (_request, reply) => {
    return notImplemented(reply, 'POS settings');
  });

  fastify.post('/pos/v1/sale-events', async (_request, reply) => {
    return notImplemented(reply, 'sale event ingestion');
  });

  fastify.post('/pos/v1/fiscal-events', async (_request, reply) => {
    return notImplemented(reply, 'fiscal event ingestion');
  });

  fastify.post('/pos/v1/shift-events', async (_request, reply) => {
    return notImplemented(reply, 'shift event ingestion');
  });
}
