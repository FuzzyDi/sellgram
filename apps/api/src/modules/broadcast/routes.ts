import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { sendPromoBroadcast } from '../../bot/bot-manager.js';

const createBroadcastSchema = z.object({
  storeId: z.string(),
  title: z.string().max(120).optional(),
  message: z.string().min(1).max(4096),
  targetType: z.enum(['ALL', 'SELECTED']),
  customerIds: z.array(z.string()).optional(),
});

export default async function broadcastRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/broadcasts', async (request) => {
    const { storeId } = request.query as { storeId?: string };
    const where: any = { tenantId: request.tenantId! };
    if (storeId) where.storeId = storeId;

    const campaigns = await prisma.broadcastCampaign.findMany({
      where,
      include: {
        store: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { success: true, data: campaigns };
  });

  fastify.get('/broadcasts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await prisma.broadcastCampaign.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: {
        recipients: {
          orderBy: { sentAt: 'desc' },
          take: 500,
          include: { customer: { select: { id: true, firstName: true, lastName: true, telegramUser: true, phone: true } } },
        },
      },
    });
    if (!campaign) return reply.status(404).send({ success: false, error: 'Campaign not found' });
    return { success: true, data: campaign };
  });

  fastify.post('/broadcasts/send', async (request, reply) => {
    try {
      const body = createBroadcastSchema.parse(request.body);
      const store = await prisma.store.findFirst({
        where: { id: body.storeId, tenantId: request.tenantId!, isActive: true },
      });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      let targetCustomerIds: string[] = [];
      if (body.targetType === 'SELECTED') {
        targetCustomerIds = [...new Set(body.customerIds || [])];
        if (!targetCustomerIds.length) {
          return reply.status(400).send({ success: false, error: 'customerIds required for SELECTED mode' });
        }
      } else {
        const orderCustomers = await prisma.order.findMany({
          where: { tenantId: request.tenantId!, storeId: body.storeId },
          select: { customerId: true },
          distinct: ['customerId'],
        });
        targetCustomerIds = orderCustomers.map((row) => row.customerId);
      }

      const campaign = await prisma.broadcastCampaign.create({
        data: {
          tenantId: request.tenantId!,
          storeId: body.storeId,
          createdByUserId: request.user!.userId,
          title: body.title,
          message: body.message,
          targetType: body.targetType,
          status: 'DRAFT',
          totalRecipients: targetCustomerIds.length,
        },
      });

      const results = await sendPromoBroadcast(body.storeId, body.message, targetCustomerIds);

      const sentCount = results.filter((r) => r.success).length;
      const failedCount = results.length - sentCount;

      await prisma.$transaction([
        prisma.broadcastCampaign.update({
          where: { id: campaign.id },
          data: {
            status: failedCount === results.length ? 'FAILED' : 'SENT',
            sentCount,
            failedCount,
            sentAt: new Date(),
          },
        }),
        prisma.broadcastRecipient.createMany({
          data: results.map((r) => ({
            campaignId: campaign.id,
            customerId: r.customerId,
            telegramId: r.telegramId,
            success: r.success,
            error: r.error,
            sentAt: new Date(),
          })),
          skipDuplicates: true,
        }),
      ]);

      return {
        success: true,
        data: { campaignId: campaign.id, total: results.length, sent: sentCount, failed: failedCount },
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
}
