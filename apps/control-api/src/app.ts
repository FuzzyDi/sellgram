import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config/index.js';

async function main() {
  const config = loadConfig();

  const fastify = Fastify({
    trustProxy: config.TRUST_PROXY || config.NODE_ENV === 'production',
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      },
    },
  });

  await fastify.register(cors, {
    origin: [
      config.ADMIN_URL,
      'http://localhost:5173',
      'https://app.sellgram.uz',
    ],
    credentials: true,
  });

  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;

    if (statusCode >= 500) {
      fastify.log.error(error);
    }

    reply.status(statusCode).send({
      success: false,
      error: statusCode < 500 ? error.message : 'Internal server error',
    });
  });

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  const systemRoutes = (await import('./modules/system/routes.js')).default;
  await fastify.register(systemRoutes, { prefix: '/api/system' });

  try {
    await fastify.listen({ port: config.CONTROL_API_PORT, host: '0.0.0.0' });
    fastify.log.info(`Control API running on http://localhost:${config.CONTROL_API_PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
