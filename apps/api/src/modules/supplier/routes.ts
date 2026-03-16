import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

const createSupplierSchema = z.object({
  name:        z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  phone:       z.string().max(30).optional(),
  email:       z.string().email().optional().or(z.literal('')),
  address:     z.string().max(500).optional(),
  note:        z.string().max(2000).optional(),
});

const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export default async function supplierRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // List suppliers
  fastify.get('/suppliers', async (request) => {
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId: request.tenantId!, isActive: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, data: suppliers };
  });

  // Get supplier + PO history
  fastify.get('/suppliers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId: request.tenantId! },
    });
    if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' });

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { supplierId: id, tenantId: request.tenantId! },
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: { ...supplier, purchaseOrders } };
  });

  // Create supplier
  fastify.post('/suppliers', {
    preHandler: [permissionGuard('manageCatalog'), planGuard('procurementEnabled')],
  }, async (request, reply) => {
    let body: z.infer<typeof createSupplierSchema>;
    try {
      body = createSupplierSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const supplier = await prisma.supplier.create({
      data: { tenantId: request.tenantId!, ...body },
    });
    return { success: true, data: supplier };
  });

  // Update supplier
  fastify.patch('/suppliers/:id', {
    preHandler: [permissionGuard('manageCatalog')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let body: z.infer<typeof updateSupplierSchema>;
    try {
      body = updateSupplierSchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.errors?.[0]?.message ?? err.message });
    }

    const existing = await prisma.supplier.findFirst({ where: { id, tenantId: request.tenantId! } });
    if (!existing) return reply.status(404).send({ success: false, error: 'Supplier not found' });

    const supplier = await prisma.supplier.update({ where: { id }, data: body });
    return { success: true, data: supplier };
  });

  // Archive supplier (soft-delete)
  fastify.delete('/suppliers/:id', {
    preHandler: [permissionGuard('manageCatalog')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId: request.tenantId! } });
    if (!existing) return reply.status(404).send({ success: false, error: 'Supplier not found' });

    await prisma.supplier.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  });
}
