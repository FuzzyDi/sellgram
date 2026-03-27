import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { createBroadcastQueue, type BroadcastJobData } from '../../jobs/broadcast.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

const SEGMENT_FILTERS = ['buyers', 'new', 'inactive'] as const;
type SegmentFilter = typeof SEGMENT_FILTERS[number];

function buildSegmentWhere(segment: SegmentFilter) {
  if (segment === 'buyers') return { ordersCount: { gt: 0 } };
  if (segment === 'new') return { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } };
  if (segment === 'inactive') return { ordersCount: 0 };
  return {};
}

const createBroadcastSchema = z.object({
  storeId: z.string(),
  title: z.string().max(120).optional(),
  message: z.string().min(1).max(4096),
  targetType: z.enum(['ALL', 'SELECTED']),
  segmentFilter: z.enum(SEGMENT_FILTERS).optional(),
  customerIds: z.array(z.string()).optional(),
});

export default async function broadcastRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  const broadcastQueue = createBroadcastQueue();

  const broadcastsQuerySchema = z.object({ storeId: z.string().optional() });

  const audienceQuerySchema = z.object({
    storeId: z.string(),
    segment: z.enum(SEGMENT_FILTERS).optional(),
  });

  fastify.get('/broadcasts/audience', async (request) => {
    const { storeId, segment } = audienceQuerySchema.parse(request.query);
    const store = await prisma.store.findFirst({
      where: { id: storeId, tenantId: request.tenantId!, isActive: true },
      select: { id: true },
    });
    if (!store) return { success: true, data: { count: 0 } };

    const where: any = { tenantId: request.tenantId!, botBlocked: false };
    if (segment) Object.assign(where, buildSegmentWhere(segment));

    const count = await prisma.customer.count({ where });
    return { success: true, data: { count } };
  });

  fastify.get('/broadcasts', async (request) => {
    const { storeId } = broadcastsQuerySchema.parse(request.query);
    const where: { tenantId: string; storeId?: string } = { tenantId: request.tenantId! };
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

  fastify.post('/broadcasts/send', {
    preHandler: [permissionGuard('manageMarketing')],
    config: { rateLimit: { max: 3, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    try {
      const body = createBroadcastSchema.parse(request.body);
      const store = await prisma.store.findFirst({
        where: { id: body.storeId, tenantId: request.tenantId!, isActive: true },
      });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      let recipientWhere: any;
      if (body.targetType === 'SELECTED') {
        const targetCustomerIds = [...new Set(body.customerIds || [])];
        if (!targetCustomerIds.length) {
          return reply.status(400).send({ success: false, error: 'customerIds required for SELECTED mode' });
        }
        recipientWhere = { tenantId: request.tenantId!, botBlocked: false, id: { in: targetCustomerIds } };
      } else {
        recipientWhere = { tenantId: request.tenantId!, botBlocked: false };
        if (body.segmentFilter) Object.assign(recipientWhere, buildSegmentWhere(body.segmentFilter));
      }

      const recipients = await prisma.customer.findMany({
        where: recipientWhere,
        select: { telegramId: true, firstName: true, id: true },
      });

      if (!recipients.length) {
        return reply.status(400).send({
          success: false,
          error: 'No recipients found for selected audience',
        });
      }

      const campaign = await prisma.broadcastCampaign.create({
        data: {
          tenantId: request.tenantId!,
          storeId: body.storeId,
          createdByUserId: request.user!.userId,
          title: body.title,
          message: body.message,
          targetType: body.targetType,
          status: 'QUEUED',
          totalRecipients: recipients.length,
        },
      });

      const jobData: BroadcastJobData = {
        campaignId: campaign.id,
        storeId: body.storeId,
        recipients: recipients.map((r) => ({
          id: r.id,
          telegramId: r.telegramId.toString(),
          firstName: r.firstName,
        })),
        payload: { title: body.title, message: body.message },
      };

      await broadcastQueue.add('send', jobData, { attempts: 2, backoff: { type: 'fixed', delay: 30_000 } });

      return {
        success: true,
        data: { campaignId: campaign.id, total: recipients.length, status: 'QUEUED' },
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
}
