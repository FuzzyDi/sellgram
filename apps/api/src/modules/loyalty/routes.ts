import { FastifyInstance } from 'fastify';
import prisma from '../../lib/prisma.js';

export default async function loyaltyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/loyalty/config', async (request) => {
    let config = await prisma.loyaltyConfig.findUnique({
      where: { tenantId: request.tenantId! },
    });
    if (!config) {
      config = await prisma.loyaltyConfig.create({
        data: { tenantId: request.tenantId! },
      });
    }
    return { success: true, data: config };
  });

  fastify.patch('/loyalty/config', async (request, reply) => {
    const { isEnabled, pointsPerUnit, unitAmount, pointValue, maxDiscountPct, minPointsToRedeem } = request.body as any;

    const data: any = {};
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    if (pointsPerUnit !== undefined) data.pointsPerUnit = pointsPerUnit;
    if (unitAmount !== undefined) data.unitAmount = unitAmount;
    if (pointValue !== undefined) data.pointValue = pointValue;
    if (maxDiscountPct !== undefined) data.maxDiscountPct = maxDiscountPct;
    if (minPointsToRedeem !== undefined) data.minPointsToRedeem = minPointsToRedeem;

    const config = await prisma.loyaltyConfig.upsert({
      where: { tenantId: request.tenantId! },
      update: data,
      create: { tenantId: request.tenantId!, ...data },
    });

    return { success: true, data: config };
  });
}
