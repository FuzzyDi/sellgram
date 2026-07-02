import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { resolveDevice } from './device-auth.js';

/**
 * POS Sync API — see docs/SBGCLOUD_ARCHITECTURE.md.
 *
 * First wave only: device activation, heartbeat, catalog snapshot (manual,
 * admin-triggered — see admin-routes.ts) and settings. Sale/fiscal/shift
 * ingestion are intentionally still stubs (501) — pending a confirmed fiscal
 * integration partner for Uzbekistan.
 *
 * Do not wire Order/prisma.order access into this module — POS sale data is
 * kept out of the existing commerce domain model on purpose
 * (docs/SBGCLOUD_ARCHITECTURE.md §2, §12).
 */

function notImplemented(reply: FastifyReply, feature: string) {
  return reply.status(501).send({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message: `POS Sync API: ${feature} is not implemented yet`,
  });
}

function unauthorized(reply: FastifyReply) {
  return reply.status(401).send({ success: false, error: 'Invalid or missing device key' });
}

const activateSchema = z.object({
  activationCode: z.string().min(1),
});

// Moderate baseline for device polling endpoints — generous enough that
// several devices behind one shop's shared IP won't trip it, but explicit
// rather than relying only on the global default (see app.ts rateLimit
// registration).
const POS_DEFAULT_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

export default async function posSyncRoutes(fastify: FastifyInstance) {
  // activationCode is short and typed in by hand at the till — without a
  // tight limit it's brute-forceable. 5/minute/IP, tighter than every other
  // endpoint here.
  fastify.post('/pos/v1/activate', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = activateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'activationCode is required' });
    }

    const activation = await prisma.deviceActivation.findUnique({
      where: { activationCode: body.data.activationCode },
      include: { device: true },
    });
    if (!activation) {
      return reply.status(404).send({ success: false, error: 'Invalid activation code' });
    }

    if (activation.status === 'PENDING' && activation.expiresAt < new Date()) {
      await prisma.deviceActivation.update({ where: { id: activation.id }, data: { status: 'EXPIRED' } });
      return reply.status(400).send({ success: false, error: 'Activation code has expired' });
    }

    if (activation.status !== 'PENDING') {
      return reply.status(400).send({ success: false, error: 'Activation code already used or invalid' });
    }

    const raw = 'pos_' + randomBytes(32).toString('hex');
    const apiKeyHash = createHash('sha256').update(raw).digest('hex');
    const apiKeyPrefix = raw.slice(0, 12);

    const now = new Date();
    const [device] = await prisma.$transaction([
      prisma.posDevice.update({
        where: { id: activation.deviceId },
        data: { status: 'ACTIVE', apiKeyHash, apiKeyPrefix },
        select: { id: true, tenantId: true, storeId: true, name: true },
      }),
      prisma.deviceActivation.update({
        where: { id: activation.id },
        data: { status: 'CONFIRMED', confirmedAt: now },
      }),
      prisma.syncCursor.upsert({
        where: { deviceId: activation.deviceId },
        create: { deviceId: activation.deviceId, lastCatalogVersion: 0 },
        update: {},
      }),
    ]);

    return reply.status(201).send({
      success: true,
      data: {
        deviceId: device.id,
        tenantId: device.tenantId,
        storeId: device.storeId,
        name: device.name,
        apiKey: raw,
      },
    });
  });

  fastify.post('/pos/v1/heartbeat', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveDevice(request.headers.authorization);
    if (!device) return unauthorized(reply);

    const now = new Date();
    await prisma.posDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } });

    return { success: true, data: { serverTime: now.toISOString() } };
  });

  fastify.get('/pos/v1/catalog/snapshot', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveDevice(request.headers.authorization);
    if (!device) return unauthorized(reply);

    // Delta sync (query.since) is out of scope for this sprint — always
    // return the latest snapshot for the device's store.
    const snapshot = await prisma.catalogSnapshot.findFirst({
      where: { tenantId: device.tenantId, storeId: device.storeId },
      orderBy: { version: 'desc' },
    });
    if (!snapshot) {
      return reply.status(404).send({ success: false, error: 'No catalog snapshot available yet' });
    }

    await prisma.syncCursor.upsert({
      where: { deviceId: device.id },
      create: { deviceId: device.id, lastCatalogVersion: snapshot.version, lastSyncAt: new Date() },
      update: { lastCatalogVersion: snapshot.version, lastSyncAt: new Date() },
    });

    return {
      success: true,
      data: {
        version: snapshot.version,
        payload: snapshot.payload,
        createdAt: snapshot.createdAt,
      },
    };
  });

  fastify.get('/pos/v1/settings', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (request, reply) => {
    const device = await resolveDevice(request.headers.authorization);
    if (!device) return unauthorized(reply);

    // Minimal, honest set: there is no per-store currency/timezone field in
    // the current schema (Sellgram Commerce is single-currency, single-TZ
    // today — see Product.currency default and TZ in .env.example). Do not
    // invent per-store settings storage here; revisit once PosSettings
    // (docs/SBGCLOUD_ARCHITECTURE.md §12) actually exists.
    return {
      success: true,
      data: {
        currency: 'UZS',
        timezone: 'Asia/Tashkent',
      },
    };
  });

  fastify.post('/pos/v1/sale-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (_request, reply) => {
    return notImplemented(reply, 'sale event ingestion');
  });

  fastify.post('/pos/v1/fiscal-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (_request, reply) => {
    return notImplemented(reply, 'fiscal event ingestion');
  });

  fastify.post('/pos/v1/shift-events', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (_request, reply) => {
    return notImplemented(reply, 'shift event ingestion');
  });

  fastify.get('/pos/v1/commands', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (_request, reply) => {
    return notImplemented(reply, 'cloud command polling');
  });

  fastify.post('/pos/v1/commands/:id/ack', { config: { rateLimit: POS_DEFAULT_RATE_LIMIT } }, async (_request, reply) => {
    return notImplemented(reply, 'cloud command acknowledgement');
  });
}
