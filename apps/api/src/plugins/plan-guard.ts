import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../lib/prisma.js';
import { PLANS, type PlanCode } from '@sellgram/shared';

type LimitKey = keyof (typeof PLANS)['FREE']['limits'];

export function planGuard(limitKey: LimitKey) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.tenantId) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: { plan: true },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: 'Tenant not found' });
    }

    const plan = PLANS[tenant.plan as PlanCode];
    if (!plan) {
      return reply.status(500).send({ success: false, error: 'Invalid plan' });
    }

    const limit = plan.limits[limitKey];

    // Boolean features
    if (limit === true) return;             // feature enabled
    if (limit === false) {
      return reply.status(402).send({
        success: false,
        error: `Feature "${limitKey}" is not available on ${plan.name} plan. Please upgrade.`,
      });
    }

    // String features (analyticsLevel)
    if (typeof limit === 'string') return;

    // Numeric limits (-1 = unlimited)
    if (limit === -1) return;

    let currentCount = 0;

    switch (limitKey) {
      case 'maxStores':
        currentCount = await prisma.store.count({ where: { tenantId: request.tenantId } });
        break;
      case 'maxProducts':
        currentCount = await prisma.product.count({
          where: { tenantId: request.tenantId, isActive: true },
        });
        break;
      case 'maxDeliveryZones':
        currentCount = await prisma.deliveryZone.count({
          where: { tenantId: request.tenantId, isActive: true },
        });
        break;
      case 'maxOrdersPerMonth': {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        currentCount = await prisma.order.count({
          where: { tenantId: request.tenantId, createdAt: { gte: startOfMonth } },
        });
        break;
      }
      default:
        return;
    }

    if (currentCount >= (limit as number)) {
      return reply.status(402).send({
        success: false,
        error: `Limit reached: ${limitKey} (${currentCount}/${limit}). Please upgrade.`,
        currentCount,
        limit,
      });
    }
  };
}

