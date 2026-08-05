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
  | 'viewReports'
  | 'manageB2B'
  // Narrower than the others: doesn't unlock a whole feature area, just
  // the one specific override of editing a RECEIVED purchase order's note
  // after the fact (procurement/routes.ts) — everything else about a
  // received document (items/qty/cost/paymentMethod) is permanently
  // locked for everyone, no override, by design (see that route's
  // comment) — corrections go through stock/debt adjustment instead.
  | 'editReceivedDocuments';

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

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { role: true, permissions: true, isActive: true },
    });

    if (!dbUser?.isActive) {
      reply.status(403).send({ success: false, error: 'Forbidden' });
      return;
    }

    // OWNER and MANAGER have full access to all features
    if (user.role === 'OWNER' || user.role === 'MANAGER') return;

    const perms = getEffectivePermissions(dbUser);
    if (!perms[permission]) {
      reply.status(403).send({ success: false, error: 'Forbidden' });
      return;
    }
  };
}
