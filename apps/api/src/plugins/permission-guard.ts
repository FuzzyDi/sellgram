import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../lib/prisma.js';
import { getEffectivePermissions } from '../modules/auth/service.js';

export type PermissionKey =
  | 'manageCatalog'
  | 'manageOrders'
  | 'manageCustomers'
  | 'manageMarketing'
  | 'manageSettings'
  | 'manageBilling'
  | 'manageUsers'
  | 'viewReports';

/**
 * Returns a Fastify preHandler that enforces RBAC.
 * OWNER and MANAGER always pass. OPERATOR must have the specific permission enabled.
 * Must be used after fastify.authenticate.
 */
export function permissionGuard(permission: PermissionKey) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user) {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
      return;
    }

    // OWNER and MANAGER have full access — skip DB lookup
    if (user.role === 'OWNER' || user.role === 'MANAGER') return;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { role: true, permissions: true, isActive: true },
    });

    if (!dbUser?.isActive) {
      reply.status(403).send({ success: false, error: 'Forbidden' });
      return;
    }

    const perms = getEffectivePermissions(dbUser);
    if (!perms[permission]) {
      reply.status(403).send({ success: false, error: 'Forbidden' });
      return;
    }
  };
}
