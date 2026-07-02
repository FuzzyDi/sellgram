import type { FastifyInstance } from 'fastify';
import { randomInt } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { planGuard } from '../../plugins/plan-guard.js';
import { permissionGuard } from '../../plugins/permission-guard.js';

const ACTIVATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const ACTIVATION_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function generateActivationCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += ACTIVATION_CODE_ALPHABET[randomInt(ACTIVATION_CODE_ALPHABET.length)];
  }
  return code;
}

const createDeviceSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1).max(200),
  deviceType: z.string().min(1).max(50).default('till'),
});

const catalogSnapshotSchema = z.object({
  storeId: z.string().min(1),
});

/**
 * Store-admin endpoints for POS device onboarding. Registered under
 * /api/store-admin — see docs/SBGCLOUD_ARCHITECTURE.md for the boundary
 * these devices operate under (Local POS Core, not this API).
 */
export default async function posDeviceAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // Create a new device + a one-time activation code to key in at the till.
  fastify.post(
    '/pos-devices',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const body = createDeviceSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: body.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const device = await prisma.posDevice.create({
        data: {
          tenantId,
          storeId: store.id,
          name: body.data.name,
          deviceType: body.data.deviceType,
        },
        select: { id: true, name: true, deviceType: true, status: true, storeId: true, createdAt: true },
      });

      // activationCode is @unique — retry on the (very unlikely) collision.
      let activation;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          activation = await prisma.deviceActivation.create({
            data: {
              deviceId: device.id,
              activationCode: generateActivationCode(),
              expiresAt: new Date(Date.now() + ACTIVATION_CODE_TTL_MS),
            },
            select: { activationCode: true, expiresAt: true },
          });
          break;
        } catch (err: any) {
          if (err?.code !== 'P2002' || attempt === 4) throw err;
        }
      }

      return reply.status(201).send({
        success: true,
        data: {
          device,
          activationCode: activation!.activationCode,
          expiresAt: activation!.expiresAt,
        },
      });
    }
  );

  // Manually build and store a catalog snapshot for a store's devices to pull.
  // Not triggered automatically on product/category changes — see
  // docs/SBGCLOUD_ARCHITECTURE.md §13 (future sprint work).
  fastify.post(
    '/pos-devices/catalog-snapshot',
    { preHandler: [planGuard('posEnabled'), permissionGuard('manageSettings')] },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const body = catalogSnapshotSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: body.error.errors[0]?.message ?? 'Invalid input' });
      }

      const store = await prisma.store.findFirst({ where: { id: body.data.storeId, tenantId }, select: { id: true } });
      if (!store) return reply.status(404).send({ success: false, error: 'Store not found' });

      const products = await prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          currency: true,
          stockQty: true,
          categoryId: true,
          variants: {
            where: { isActive: true },
            select: { id: true, name: true, sku: true, price: true, stockQty: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const last = await prisma.catalogSnapshot.findFirst({
        where: { tenantId, storeId: store.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;

      const snapshot = await prisma.catalogSnapshot.create({
        data: {
          tenantId,
          storeId: store.id,
          version,
          payload: { products } as any,
        },
        select: { id: true, version: true, createdAt: true },
      });

      return reply.status(201).send({ success: true, data: snapshot });
    }
  );
}
