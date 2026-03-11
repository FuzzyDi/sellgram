import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { verifyAccessToken } from '../lib/jwt.js';
import type { JwtPayload } from '@sellgram/shared';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: JwtPayload;
    tenantId?: string;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }

    try {
      const token = authHeader.slice(7);
      const payload = await verifyAccessToken(token);
      request.user = payload;
      request.tenantId = payload.tenantId;
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid token' });
    }
  });
}

export default fp(authPlugin, { name: 'auth' });
