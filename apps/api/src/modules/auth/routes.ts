import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { permissionGuard } from '../../plugins/permission-guard.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  changeMyPasswordSchema,
  resetTeamPasswordSchema,
  teamUserCreateSchema,
  teamUserUpdateSchema,
  updateMeSchema,
} from './schema.js';
import * as authService from './service.js';
import { AuthServiceError } from './service.js';
import { writeAuditLog } from '../../lib/audit.js';
import prisma from '../../lib/prisma.js';

function mapAuthError(err: unknown) {
  if (err instanceof AuthServiceError) {
    if (err.code === 'EMAIL_ALREADY_REGISTERED') return { status: 400, error: 'Email already registered' };
    if (err.code === 'TENANT_SLUG_TAKEN') return { status: 400, error: 'Tenant slug already taken' };
    if (err.code === 'INVALID_CREDENTIALS') return { status: 401, error: 'Invalid credentials' };
    if (err.code === 'USER_NOT_FOUND') return { status: 401, error: 'User not found' };
  }

  if (err instanceof Error) {
    if (err.message === 'FORBIDDEN') return { status: 403, error: 'Forbidden' };
    if (err.message === 'USER_NOT_FOUND') return { status: 404, error: 'User not found' };
    if (err.message === 'NOTHING_TO_UPDATE') return { status: 400, error: 'Nothing to update' };
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
        permissions: true,
        isActive: true,
        tenant: {
          select: { id: true, name: true, slug: true, plan: true },
        },
      },
    });

    const effectivePermissions = user ? authService.getEffectivePermissions(user as any) : null;
    return {
      success: true,
      data: user ? { ...user, effectivePermissions } : null,
    };
  });

  fastify.patch('/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const body = updateMeSchema.parse(request.body);
      const data = await authService.updateMyProfile({ userId: request.user!.userId, ...body });
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.post('/auth/me/change-password', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const body = changeMyPasswordSchema.parse(request.body);
      const data = await authService.changeMyPassword({ userId: request.user!.userId, ...body });
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.get('/auth/team', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const data = await authService.listTeamUsers({ userId: request.user!.userId, tenantId: request.user!.tenantId });
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.post('/auth/team', {
    preHandler: [fastify.authenticate, permissionGuard('manageUsers')],
  }, async (request, reply) => {
    try {
      const body = teamUserCreateSchema.parse(request.body);
      const data = await authService.createTeamUser({
        actorUserId: request.user!.userId,
        tenantId: request.user!.tenantId,
        ...body,
      });
      writeAuditLog({ tenantId: request.user!.tenantId, actorId: request.user?.userId, action: 'team.user.create', targetId: data.id, details: { email: data.email, role: data.role } });
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.patch('/auth/team/:id', {
    preHandler: [fastify.authenticate, permissionGuard('manageUsers')],
  }, async (request, reply) => {
    try {
      const body = teamUserUpdateSchema.parse(request.body);
      const params = request.params as { id: string };
      const data = await authService.updateTeamUser({
        actorUserId: request.user!.userId,
        tenantId: request.user!.tenantId,
        targetUserId: params.id,
        ...body,
      });
      writeAuditLog({ tenantId: request.user!.tenantId, actorId: request.user?.userId, action: 'team.user.update', targetId: params.id });
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
  });

  fastify.post('/auth/team/:id/reset-password', {
    preHandler: [fastify.authenticate, permissionGuard('manageUsers')],
  }, async (request, reply) => {
    try {
      const body = resetTeamPasswordSchema.parse(request.body);
      const params = request.params as { id: string };
      const data = await authService.resetTeamUserPassword({
        actorUserId: request.user!.userId,
        tenantId: request.user!.tenantId,
        targetUserId: params.id,
        newPassword: body.newPassword,
      });
      writeAuditLog({ tenantId: request.user!.tenantId, actorId: request.user?.userId, action: 'team.user.reset-password', targetId: params.id });
      return { success: true, data };
    } catch (err: unknown) {
      const mapped = mapAuthError(err);
      return reply.status(mapped.status).send({ success: false, error: mapped.error });
    }
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
