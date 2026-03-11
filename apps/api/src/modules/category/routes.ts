import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').replace(/^-|-$/g, '') || 'cat-' + Date.now();
}

export default async function categoryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/categories', async (request) => {
    const categories = await prisma.category.findMany({
      where: { tenantId: request.tenantId!, isActive: true },
      include: { _count: { select: { products: true } }, children: true },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: categories };
  });

  fastify.post('/categories', async (request, reply) => {
    try {
      const body = categorySchema.parse(request.body);
      const slug = body.slug || slugify(body.name);
      const category = await prisma.category.create({
        data: { tenantId: request.tenantId!, ...body, slug },
      });
      return { success: true, data: category };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  fastify.patch('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = categorySchema.partial().parse(request.body);
    const result = await prisma.category.updateMany({
      where: { id, tenantId: request.tenantId! },
      data: body as any,
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, message: 'Category updated' };
  });

  fastify.delete('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.category.updateMany({
      where: { id, tenantId: request.tenantId! },
      data: { isActive: false },
    });
    if (result.count === 0) return reply.status(404).send({ success: false, error: 'Not found' });
    return { success: true, message: 'Category deleted' };
  });
}
