import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { writeAuditLog } from '../../lib/audit.js';

export const DEFAULT_TIERS = [
  { name: 'Bronze',   nameUz: 'Bronza',  minSpend: 0,        multiplier: 1,   color: '#cd7f32' },
  { name: 'Silver',   nameUz: 'Kumush',  minSpend: 500000,   multiplier: 1.5, color: '#9e9e9e' },
  { name: 'Gold',     nameUz: 'Oltin',   minSpend: 2000000,  multiplier: 2,   color: '#ffd700' },
  { name: 'Platinum', nameUz: 'Platina', minSpend: 10000000, multiplier: 3,   color: '#b5a8d5' },
];

const tierSchema = z.object({
  name:       z.string().min(1).max(40),
  nameUz:     z.string().min(1).max(40),
  minSpend:   z.number().int().min(0),
  multiplier: z.number().min(0.1).max(10),
  color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#cd7f32'),
});

const loyaltyConfigSchema = z.object({
  isEnabled:        z.boolean().optional(),
  pointsPerUnit:    z.number().int().positive().optional(),
  unitAmount:       z.number().positive().optional(),
  pointValue:       z.number().positive().optional(),
  maxDiscountPct:   z.number().min(0).max(100).optional(),
  minPointsToRedeem: z.number().int().min(0).optional(),
  tiers:            z.array(tierSchema).min(1).optional(),
  referralEnabled:     z.boolean().optional(),
  referralBonus:       z.number().int().min(0).optional(),
  referralFriendBonus: z.number().int().min(0).optional(),
});

export function computeTier(totalSpent: number, tiers: typeof DEFAULT_TIERS) {
  const sorted = [...tiers].sort((a, b) => b.minSpend - a.minSpend);
  return sorted.find((t) => totalSpent >= t.minSpend) ?? tiers[0];
}

export default async function loyaltyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/loyalty/config', async (request) => {
    const config = await prisma.loyaltyConfig.upsert({
      where: { tenantId: request.tenantId! },
      update: {},
      create: { tenantId: request.tenantId! },
    });
    return { success: true, data: { ...config, tiers: (config.tiers as any) ?? DEFAULT_TIERS } };
  });

  fastify.patch('/loyalty/config', { preHandler: [permissionGuard('manageSettings')] }, async (request, reply) => {
    let parsed: z.infer<typeof loyaltyConfigSchema>;
    try {
      parsed = loyaltyConfigSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const data: any = {};
    if (parsed.isEnabled !== undefined)        data.isEnabled = parsed.isEnabled;
    if (parsed.pointsPerUnit !== undefined)    data.pointsPerUnit = parsed.pointsPerUnit;
    if (parsed.unitAmount !== undefined)       data.unitAmount = parsed.unitAmount;
    if (parsed.pointValue !== undefined)       data.pointValue = parsed.pointValue;
    if (parsed.maxDiscountPct !== undefined)   data.maxDiscountPct = parsed.maxDiscountPct;
    if (parsed.minPointsToRedeem !== undefined) data.minPointsToRedeem = parsed.minPointsToRedeem;
    if (parsed.tiers !== undefined)            data.tiers = parsed.tiers;
    if (parsed.referralEnabled !== undefined)     data.referralEnabled = parsed.referralEnabled;
    if (parsed.referralBonus !== undefined)       data.referralBonus = parsed.referralBonus;
    if (parsed.referralFriendBonus !== undefined) data.referralFriendBonus = parsed.referralFriendBonus;

    const config = await prisma.loyaltyConfig.upsert({
      where: { tenantId: request.tenantId! },
      update: data,
      create: { tenantId: request.tenantId!, ...data },
    });

    writeAuditLog({ tenantId: request.tenantId!, actorId: request.user?.userId, action: 'loyalty.config.update' });
    return { success: true, data: { ...config, tiers: (config.tiers as any) ?? DEFAULT_TIERS } };
  });
}
