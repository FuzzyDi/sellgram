import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../lib/prisma.js';
import { PLANS, type PlanCode } from '@sellgram/shared';
import { getEffectivePlan } from '../lib/billing.js';

type LimitKey = keyof (typeof PLANS)['FREE']['limits'];

export function planGuard(limitKey: LimitKey) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.tenantId) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: { plan: true, planExpiresAt: true },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: 'Tenant not found' });
    }

    // Treat plan as FREE if subscription has expired (3-day grace period applies)
    const effectivePlan = getEffectivePlan(tenant.plan, tenant.planExpiresAt) as PlanCode;
    const plan = PLANS[effectivePlan];
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
        const now = new Date();
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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

