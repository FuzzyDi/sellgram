import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';

const loyaltyConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  pointsPerUnit: z.number().int().positive().optional(),
  unitAmount: z.number().positive().optional(),        // must be > 0 — divides order total
  pointValue: z.number().positive().optional(),        // must be > 0 — multiplied to compute discount
  maxDiscountPct: z.number().min(0).max(100).optional(),
  minPointsToRedeem: z.number().int().min(0).optional(),
});

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
    let parsed: z.infer<typeof loyaltyConfigSchema>;
    try {
      parsed = loyaltyConfigSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const { isEnabled, pointsPerUnit, unitAmount, pointValue, maxDiscountPct, minPointsToRedeem } = parsed;
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
