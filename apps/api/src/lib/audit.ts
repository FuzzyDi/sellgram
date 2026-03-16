import prisma from './prisma.js';
import type { Prisma } from '@prisma/client';

export function writeAuditLog(opts: {
  tenantId: string;
  actorId?: string;
  action: string;
  targetId?: string;
  details?: Record<string, unknown>;
}): void {
  try {
    const { details, ...rest } = opts;
    const data: Prisma.TenantAuditLogCreateInput = {
      tenant: { connect: { id: opts.tenantId } },
      actorId: rest.actorId,
      action: rest.action,
      targetId: rest.targetId,
      details: details as Prisma.InputJsonValue | undefined,
    };
    prisma.tenantAuditLog.create({ data }).catch(() => {});
  } catch {
    // audit log failures must never affect the main request flow
  }
}
