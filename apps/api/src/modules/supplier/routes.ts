import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { permissionGuard } from '../../plugins/permission-guard.js';
import { writeAuditLog } from '../../lib/audit.js';

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

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(2000).optional(),
});

const listLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// note required — same reasoning as counterparty/routes.ts's
// recordAdjustmentSchema: a manual correction isn't self-explanatory the
// way a payment is.
const recordAdjustmentSchema = z.object({
  delta: z.number().refine((n) => n !== 0, { message: 'delta must not be zero' }),
  note: z.string().min(1).max(2000),
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

  // Record a payment made to this supplier — reduces currentDebt, same
  // atomic cached-total + append-only-ledger-row pattern as
  // counterparty/routes.ts's /payments, mirror-imaged: a payment there
  // decreases what a customer owes the tenant, here it decreases what the
  // tenant owes the supplier. Overpayment is allowed (currentDebt can go
  // negative — an advance/credit in the tenant's favor), same reasoning.
  fastify.post(
    '/suppliers/:id/payments',
    { preHandler: [permissionGuard('manageCatalog')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.tenantId!;
      const parsed = recordPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }
      const { amount, note } = parsed.data;

      const supplier = await prisma.supplier.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' });

      const result = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.supplier.update({
          where: { id },
          data: { currentDebt: { decrement: amount } },
          select: { currentDebt: true },
        });
        const ledgerEntry = await tx.supplierLedger.create({
          data: {
            tenantId,
            supplierId: id,
            type: 'PAYMENT_MADE',
            delta: -amount,
            purchaseOrderId: null,
            note: note ?? null,
          },
        });
        return { ledgerEntry, currentDebt: updated.currentDebt };
      });

      return reply.status(201).send({ success: true, data: result });
    }
  );

  // Manual debt correction — mirrors counterparty/routes.ts's
  // /adjustments, including the audit-log write (a manual change to
  // financial state needs a paper trail beyond the ledger row itself).
  fastify.post(
    '/suppliers/:id/adjustments',
    { preHandler: [permissionGuard('manageCatalog')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.tenantId!;
      const parsed = recordAdjustmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }
      const { delta, note } = parsed.data;

      const supplier = await prisma.supplier.findFirst({ where: { id, tenantId }, select: { id: true, currentDebt: true } });
      if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' });

      const previousDebt = supplier.currentDebt;

      const result = await prisma.$transaction(async (tx: any) => {
        const updated = await tx.supplier.update({
          where: { id },
          data: { currentDebt: { increment: delta } },
          select: { currentDebt: true },
        });
        const ledgerEntry = await tx.supplierLedger.create({
          data: {
            tenantId,
            supplierId: id,
            type: 'ADJUSTMENT',
            delta,
            purchaseOrderId: null,
            note,
          },
        });
        return { ledgerEntry, currentDebt: updated.currentDebt };
      });

      writeAuditLog({
        tenantId,
        actorId: request.user?.userId,
        action: 'procurement.debt.adjusted',
        targetId: id,
        details: { supplierId: id, delta, note, previousDebt, newDebt: result.currentDebt },
      });

      return reply.status(201).send({ success: true, data: result });
    }
  );

  // Full PURCHASE_CHARGE/PAYMENT_MADE/ADJUSTMENT history for one supplier
  // — mirrors counterparty/routes.ts's /ledger.
  fastify.get(
    '/suppliers/:id/ledger',
    { preHandler: [permissionGuard('manageCatalog')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.tenantId!;
      const parsed = listLedgerQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      }
      const { page, pageSize } = parsed.data;
      const skip = (page - 1) * pageSize;

      const supplier = await prisma.supplier.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!supplier) return reply.status(404).send({ success: false, error: 'Supplier not found' });

      const where = { supplierId: id };
      const [items, total] = await Promise.all([
        prisma.supplierLedger.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.supplierLedger.count({ where }),
      ]);

      return {
        success: true,
        data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      };
    }
  );
}
