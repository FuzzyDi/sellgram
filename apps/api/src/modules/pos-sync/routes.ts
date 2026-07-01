import { FastifyInstance } from 'fastify';

function notImplemented(feature: string) {
  return {
    success: false,
    error: 'Not implemented',
    feature,
    message: 'POS sync is reserved for a future additive SBGCloud module.',
  };
}

export default async function posSyncRoutes(fastify: FastifyInstance) {
  fastify.post('/activate', async (_request, reply) => {
    return reply.status(501).send(notImplemented('device_activation'));
  });

  fastify.post('/heartbeat', async (_request, reply) => {
    return reply.status(501).send(notImplemented('device_heartbeat'));
  });

  fastify.get('/catalog/snapshot', async (_request, reply) => {
    return reply.status(501).send(notImplemented('catalog_snapshot'));
  });

  fastify.get('/settings', async (_request, reply) => {
    return reply.status(501).send(notImplemented('pos_settings'));
  });

  fastify.post('/sale-events', async (_request, reply) => {
    return reply.status(501).send(notImplemented('sale_events'));
  });

  fastify.post('/fiscal-events', async (_request, reply) => {
    return reply.status(501).send(notImplemented('fiscal_events'));
  });

  fastify.post('/shift-events', async (_request, reply) => {
    return reply.status(501).send(notImplemented('shift_events'));
  });
}
