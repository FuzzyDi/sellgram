import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import type { RegisterInput, LoginInput } from './schema.js';

const SALT_ROUNDS = 12;

type TeamPermissionKey =
  | 'manageCatalog'
  | 'manageOrders'
  | 'manageCustomers'
  | 'manageMarketing'
  | 'manageSettings'
  | 'manageBilling'
  | 'manageUsers'
  | 'viewReports';

type TeamPermissions = Record<TeamPermissionKey, boolean>;

const FULL_PERMISSIONS: TeamPermissions = {
  manageCatalog: true,
  manageOrders: true,
  manageCustomers: true,
  manageMarketing: true,
  manageSettings: true,
  manageBilling: true,
  manageUsers: true,
  viewReports: true,
};

const OPERATOR_DEFAULT_PERMISSIONS: TeamPermissions = {
  manageCatalog: true,
  manageOrders: true,
  manageCustomers: true,
  manageMarketing: false,
  manageSettings: false,
  manageBilling: false,
  manageUsers: false,
  viewReports: true,
};

function normalizeOperatorPermissions(input?: Partial<TeamPermissions> | null): TeamPermissions {
  return {
    ...OPERATOR_DEFAULT_PERMISSIONS,
    ...(input || {}),
  };
}

function getEffectivePermissions(user: { role: string; permissions?: Prisma.JsonValue | null }): TeamPermissions {
  if (user.role === 'OWNER' || user.role === 'MANAGER') return { ...FULL_PERMISSIONS };
  const raw = (user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
    ? (user.permissions as Record<string, unknown>)
    : {}) as Partial<TeamPermissions>;
  return normalizeOperatorPermissions(raw);
}

function canManageUsers(user: { role: string; permissions?: Prisma.JsonValue | null }) {
  if (user.role === 'OWNER' || user.role === 'MANAGER') return true;
  return getEffectivePermissions(user).manageUsers;
}

function mapPublicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  permissions?: Prisma.JsonValue | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const effectivePermissions = getEffectivePermissions(user);
  const customPermissions =
    user.role === 'OPERATOR'
      ? normalizeOperatorPermissions(
          (user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
            ? (user.permissions as Record<string, unknown>)
            : {}) as Partial<TeamPermissions>
        )
      : null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    permissions: customPermissions,
    effectivePermissions,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export class AuthServiceError extends Error {
  code: 'EMAIL_ALREADY_REGISTERED' | 'TENANT_SLUG_TAKEN' | 'INVALID_CREDENTIALS' | 'USER_NOT_FOUND';

  constructor(code: AuthServiceError['code']) {
    super(code);
    this.code = code;
  }
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AuthServiceError('EMAIL_ALREADY_REGISTERED');

  const existingTenant = await prisma.tenant.findUnique({ where: { slug: input.tenantSlug } });
  if (existingTenant) throw new AuthServiceError('TENANT_SLUG_TAKEN');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const { tenant, user } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.tenantName,
        slug: input.tenantSlug,
      },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: input.email,
        passwordHash,
        name: input.name,
        role: 'OWNER',
      },
    });

    await tx.loyaltyConfig.create({
      data: { tenantId: tenant.id },
    });

    return { tenant, user };
  });

  const payload = { userId: user.id, tenantId: tenant.id, role: user.role };
  const accessToken = await signAccessToken(payload);
  const refreshToken = await signRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
    user: mapPublicUser({ ...user, isActive: user.isActive }),
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
  };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { tenant: true },
  });

  if (!user || !user.isActive) throw new AuthServiceError('INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new AuthServiceError('INVALID_CREDENTIALS');

  const payload = { userId: user.id, tenantId: user.tenantId, role: user.role };
  const accessToken = await signAccessToken(payload);
  const refreshToken = await signRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
    user: mapPublicUser(user),
    tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, plan: user.tenant.plan },
  };
}

export async function refresh(refreshTokenStr: string) {
  const payload = await verifyRefreshToken(refreshTokenStr);
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { tenant: true },
  });
  if (!user || !user.isActive) throw new AuthServiceError('USER_NOT_FOUND');

  const newPayload = { userId: user.id, tenantId: user.tenantId, role: user.role };
  const accessToken = await signAccessToken(newPayload);
  const newRefreshToken = await signRefreshToken(newPayload);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function updateMyProfile(input: {
  userId: string;
  name?: string;
  email?: string;
}) {
  if (!input.name && !input.email) throw new Error('NOTHING_TO_UPDATE');

  if (input.email) {
    const existing = await prisma.user.findFirst({
      where: { email: input.email, id: { not: input.userId } },
      select: { id: true },
    });
    if (existing) throw new Error('EMAIL_ALREADY_REGISTERED');
  }

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email } : {}),
    },
  });

  return mapPublicUser(updated);
}

export async function changeMyPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || !user.isActive) throw new Error('USER_NOT_FOUND');

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) throw new Error('INVALID_CREDENTIALS');

  const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: input.userId }, data: { passwordHash } });

  return { ok: true };
}

export async function listTeamUsers(input: { userId: string; tenantId: string }) {
  const actor = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { role: true, permissions: true, isActive: true },
  });
  if (!actor?.isActive) throw new Error('FORBIDDEN');
  if (!canManageUsers(actor)) throw new Error('FORBIDDEN');

  const users = await prisma.user.findMany({
    where: { tenantId: input.tenantId },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return users.map((u) => mapPublicUser(u));
}

export async function createTeamUser(input: {
  actorUserId: string;
  tenantId: string;
  email: string;
  password: string;
  name: string;
  role: 'MANAGER' | 'OPERATOR';
  permissions?: Partial<TeamPermissions>;
}) {
  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { role: true, permissions: true, isActive: true },
  });
  if (!actor?.isActive) throw new Error('FORBIDDEN');
  if (!canManageUsers(actor)) throw new Error('FORBIDDEN');

  if (input.role === 'MANAGER' && actor.role !== 'OWNER') {
    throw new Error('FORBIDDEN');
  }

  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new AuthServiceError('EMAIL_ALREADY_REGISTERED');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const created = await prisma.user.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
      permissions: input.role === 'OPERATOR' ? (normalizeOperatorPermissions(input.permissions) as any) : Prisma.DbNull,
    },
  });

  return mapPublicUser(created);
}

export async function updateTeamUser(input: {
  actorUserId: string;
  tenantId: string;
  targetUserId: string;
  name?: string;
  role?: 'MANAGER' | 'OPERATOR';
  isActive?: boolean;
  permissions?: Partial<TeamPermissions>;
}) {
  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { role: true, permissions: true, isActive: true },
  });
  if (!actor?.isActive) throw new Error('FORBIDDEN');
  if (!canManageUsers(actor)) throw new Error('FORBIDDEN');

  const target = await prisma.user.findFirst({
    where: { id: input.targetUserId, tenantId: input.tenantId },
    select: { id: true, role: true, permissions: true },
  });
  if (!target) throw new Error('USER_NOT_FOUND');
  if (target.role === 'OWNER') throw new Error('FORBIDDEN');
  if (target.id === input.actorUserId && input.isActive === false) throw new Error('FORBIDDEN');

  if (input.role === 'MANAGER' && actor.role !== 'OWNER') {
    throw new Error('FORBIDDEN');
  }

  const nextRole = input.role || (target.role as 'MANAGER' | 'OPERATOR');
  const permissions =
    nextRole === 'OPERATOR'
      ? normalizeOperatorPermissions(input.permissions || (target.permissions as Partial<TeamPermissions> | null) || undefined)
      : null;

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
      ...(input.role ? { role: input.role } : {}),
      permissions: permissions ? (permissions as any) : Prisma.DbNull,
    },
  });

  return mapPublicUser(updated);
}

export async function resetTeamUserPassword(input: {
  actorUserId: string;
  tenantId: string;
  targetUserId: string;
  newPassword: string;
}) {
  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { role: true, permissions: true, isActive: true },
  });
  if (!actor?.isActive) throw new Error('FORBIDDEN');
  if (!canManageUsers(actor)) throw new Error('FORBIDDEN');

  const target = await prisma.user.findFirst({
    where: { id: input.targetUserId, tenantId: input.tenantId },
    select: { id: true, role: true },
  });
  if (!target) throw new Error('USER_NOT_FOUND');
  if (target.role === 'OWNER' && actor.role !== 'OWNER') throw new Error('FORBIDDEN');

  const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });

  return { ok: true };
}

export { getEffectivePermissions };
