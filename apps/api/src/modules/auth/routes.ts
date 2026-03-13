import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { registerSchema, loginSchema, refreshSchema } from './schema.js';
import * as authService from './service.js';
import { AuthServiceError } from './service.js';
import prisma from '../../lib/prisma.js';

function mapAuthError(err: unknown) {
  if (err instanceof AuthServiceError) {
    if (err.code === 'EMAIL_ALREADY_REGISTERED') return { status: 400, error: 'Email already registered' };
    if (err.code === 'TENANT_SLUG_TAKEN') return { status: 400, error: 'Tenant slug already taken' };
    if (err.code === 'INVALID_CREDENTIALS') return { status: 401, error: 'Invalid credentials' };
    if (err.code === 'USER_NOT_FOUND') return { status: 401, error: 'User not found' };
  }

  if (err instanceof Error) {
    return { status: 400, error: err.message };
  }

  return { status: 400, error: 'Bad request' };
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/register', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
      },
    },
  }, async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);
      const result = await authService.register(body);
      return { success: true, data: result };
    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.post('/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '10 minutes',
      },
    },
  }, async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);
      const result = await authService.login(body);
      return { success: true, data: result };
    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.post('/auth/refresh', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '10 minutes',
      },
    },
  }, async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);
      const result = await authService.refresh(body.refreshToken);
      return { success: true, data: result };
    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.get('/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenant: {
          select: { id: true, name: true, slug: true, plan: true },
        },
      },
    });
    return { success: true, data: user };
  });

  fastify.post('/auth/telegram-link-code', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: request.user!.userId },
      data: { telegramLinkCode: code, telegramLinkCodeExpiresAt: expiresAt },
    });

    return {
      success: true,
      data: {
        code,
        expiresAt,
        command: `/admin ${code}`,
      },
    };
  });
}
