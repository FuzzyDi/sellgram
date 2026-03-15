import { FastifyInstance } from 'fastify';
import prisma from '../../lib/prisma.js';

export default async function customerRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/customers', async (request) => {
    const { page = 1, pageSize = 20, search } = request.query as any;
    const skip = (Number(page) - 1) * Number(pageSize);

    const where: any = { tenantId: request.tenantId! };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { telegramUser: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(pageSize),
      }),
      prisma.customer.count({ where }),
    ]);

    // Convert BigInt to string for JSON serialization
    const serializedItems = items.map((c: any) => ({ ...c, telegramId: c.telegramId.toString() }));

    return {
      success: true,
      data: { items: serializedItems, total, page: Number(page), pageSize: Number(pageSize), totalPages: Math.ceil(total / Number(pageSize)) },
    };
  });

  fastify.get('/customers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: request.tenantId! },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, take: 10 },
        loyaltyTxns: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' });
    return { success: true, data: { ...customer, telegramId: customer.telegramId.toString() } };
  });

  fastify.patch('/customers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tags, note, phone } = request.body as any;
    const data: any = {};
    if (tags !== undefined) data.tags = tags;
    if (note !== undefined) data.note = note;
    if (phone !== undefined) data.phone = phone;

    const result = await prisma.customer.updateMany({
      where: { id, tenantId: request.tenantId! },
      data,
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, message: 'Customer updated' };
  });

  // Manual loyalty adjustment
  fastify.post('/customers/:id/loyalty', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { points, description } = request.body as { points: number; description: string };
    const tenantId = request.tenantId!;

    let newBalance: number;
    try {
      newBalance = await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id, tenantId },
          select: { loyaltyPoints: true },
        });
        if (!customer) throw new Error('NOT_FOUND');

        const balance = customer.loyaltyPoints + points;
        if (balance < 0) throw new Error('INSUFFICIENT_POINTS');

        await tx.customer.update({
          where: { id },
          data: { loyaltyPoints: balance },
        });

        await tx.loyaltyTransaction.create({
          data: {
            customerId: id,
            tenantId,
            type: 'ADJUST',
            points,
            balanceAfter: balance,
            description: description || 'Manual adjustment',
          },
        });

        return balance;
      });
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: 'Not found' });
      }
      if (err.message === 'INSUFFICIENT_POINTS') {
        return reply.status(400).send({ success: false, error: 'Insufficient points' });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }

    return { success: true, data: { loyaltyPoints: newBalance } };
  });
}

