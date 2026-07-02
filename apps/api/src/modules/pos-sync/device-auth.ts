import { createHash } from 'crypto';
import prisma from '../../lib/prisma.js';

export type ResolvedDevice = {
  id: string;
  tenantId: string;
  storeId: string;
};

/**
 * Resolves a POS device from its `Authorization: Bearer <key>` header, the
 * same hash-only lookup pattern as the tenant API key in public-api/routes.ts.
 * Only ACTIVE devices (i.e. an activation has been confirmed) may authenticate.
 */
export async function resolveDevice(authHeader: string | undefined): Promise<ResolvedDevice | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const raw = authHeader.slice(7).trim();
  if (!raw) return null;

  const apiKeyHash = createHash('sha256').update(raw).digest('hex');
  const device = await prisma.posDevice.findUnique({
    where: { apiKeyHash },
    select: { id: true, tenantId: true, storeId: true, status: true },
  });
  if (!device || device.status !== 'ACTIVE') return null;

  return { id: device.id, tenantId: device.tenantId, storeId: device.storeId };
}
