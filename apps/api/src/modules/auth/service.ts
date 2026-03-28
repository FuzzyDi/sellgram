import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { getConfig } from '../../config/index.js';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
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

const MARKETER_DEFAULT_PERMISSIONS: TeamPermissions = {
  manageCatalog: false,
  manageOrders: false,
  manageCustomers: true,
  manageMarketing: true,
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

function normalizeMarketerPermissions(input?: Partial<TeamPermissions> | null): TeamPermissions {
  return {
    ...MARKETER_DEFAULT_PERMISSIONS,
    ...(input || {}),
  };
}

/**
 * Ensures an actor cannot grant permissions they don't possess themselves.
 * OWNER and MANAGER are exempt — they can grant any permission.
 */
function clampPermissionsToActor(
  permissions: TeamPermissions,
  actor: { role: string; permissions?: Prisma.JsonValue | null }
): TeamPermissions {
  if (actor.role === 'OWNER' || actor.role === 'MANAGER') return permissions;
  const actorPerms = getEffectivePermissions(actor);
  const clamped = { ...permissions };
  for (const key of Object.keys(clamped) as TeamPermissionKey[]) {
    if (!actorPerms[key]) clamped[key] = false;
  }
  return clamped;
}

function getEffectivePermissions(user: { role: string; permissions?: Prisma.JsonValue | null }): TeamPermissions {
  if (user.role === 'OWNER' || user.role === 'MANAGER') return { ...FULL_PERMISSIONS };
  const raw = (user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
    ? (user.permissions as Record<string, unknown>)
    : {}) as Partial<TeamPermissions>;
  if (user.role === 'MARKETER') return normalizeMarketerPermissions(raw);
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
  const rawPerms = (user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
    ? (user.permissions as Record<string, unknown>)
    : {}) as Partial<TeamPermissions>;
  const customPermissions =
    user.role === 'OPERATOR'
      ? normalizeOperatorPermissions(rawPerms)
      : user.role === 'MARKETER'
        ? normalizeMarketerPermissions(rawPerms)
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
  }).catch((err) => {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
      const fields = (err.meta?.target as string[] | undefined) ?? [];
      if (fields.includes('email')) throw new AuthServiceError('EMAIL_ALREADY_REGISTERED');
      if (fields.includes('slug')) throw new AuthServiceError('TENANT_SLUG_TAKEN');
    }
    throw err;
  });

  const payload = { userId: user.id, tenantId: tenant.id, role: user.role };
  const accessToken = await signAccessToken(payload);
  const refreshToken = await signRefreshToken(payload);

  // Welcome email — fire and forget
  import('../../lib/mailer.js').then(({ sendEmail, tplWelcome }) => {
    const { ADMIN_URL } = getConfig();
    const tpl = tplWelcome({ name: user.name, tenantName: tenant.name, adminUrl: ADMIN_URL });
    return sendEmail({ to: user.email, ...tpl });
  }).catch(() => {});

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

  try {
    const updated = await prisma.user.update({
      where: { id: input.userId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.email ? { email: input.email } : {}),
      },
    });

    return mapPublicUser(updated);
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Error('EMAIL_ALREADY_REGISTERED');
    }
    throw err;
  }
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
  role: 'MANAGER' | 'OPERATOR' | 'MARKETER';
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
  const basePerms = input.role === 'MARKETER'
    ? normalizeMarketerPermissions(input.permissions)
    : normalizeOperatorPermissions(input.permissions);
  const rawPermissions = basePerms;
  const permissions = (input.role === 'OPERATOR' || input.role === 'MARKETER')
    ? clampPermissionsToActor(rawPermissions, actor)
    : null;
  const created = await prisma.user.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
      permissions: permissions ? (permissions as any) : Prisma.DbNull,
    },
  });

  return mapPublicUser(created);
}

export async function updateTeamUser(input: {
  actorUserId: string;
  tenantId: string;
  targetUserId: string;
  name?: string;
  role?: 'MANAGER' | 'OPERATOR' | 'MARKETER';
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

  const nextRole = input.role || (target.role as 'MANAGER' | 'OPERATOR' | 'MARKETER');
  const mergedPerms = input.permissions || (target.permissions as Partial<TeamPermissions> | null) || undefined;
  const basePerms = nextRole === 'MARKETER'
    ? normalizeMarketerPermissions(mergedPerms)
    : normalizeOperatorPermissions(mergedPerms);
  const permissions = (nextRole === 'OPERATOR' || nextRole === 'MARKETER')
    ? clampPermissionsToActor(basePerms, actor)
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

export async function forgotPassword(email: string): Promise<{ method: string }> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, tenantId: true, adminTelegramId: true, isActive: true },
  });
  // Silently succeed if user not found (prevent enumeration)
  if (!user || !user.isActive) return { method: 'telegram' };
  if (!user.adminTelegramId) throw new Error('NO_TELEGRAM');

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: tokenHash, passwordResetExpiry: expiry },
  });

  // Try Telegram first, fall back to email
  let method = 'telegram';
  if (user.adminTelegramId) {
    const { sendMessageToOwner } = await import('../../bot/bot-manager.js');
    const sent = await sendMessageToOwner(
      user.tenantId,
      user.adminTelegramId,
      `🔐 <b>Сброс пароля SellGram</b>\n\nВаш код: <code>${code}</code>\n\nКод действителен 15 минут. Если вы не запрашивали сброс — проигнорируйте это сообщение.`,
    );
    if (!sent) method = 'email';
  } else {
    method = 'email';
  }

  if (method === 'email') {
    const { sendEmail, tplPasswordReset } = await import('../../lib/mailer.js');
    const tpl = tplPasswordReset({ code });
    const sent = await sendEmail({ to: email.toLowerCase().trim(), ...tpl });
    if (!sent) throw new Error('NO_TELEGRAM');
  }

  return { method };
}

export async function resetPasswordWithCode(input: { email: string; code: string; newPassword: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase().trim() },
    select: { id: true, passwordResetToken: true, passwordResetExpiry: true },
  });
  if (!user || !user.passwordResetToken || !user.passwordResetExpiry) {
    throw new AuthServiceError('INVALID_CREDENTIALS');
  }
  if (user.passwordResetExpiry < new Date()) throw new AuthServiceError('INVALID_CREDENTIALS');

  const tokenHash = crypto.createHash('sha256').update(input.code.trim()).digest('hex');
  if (tokenHash !== user.passwordResetToken) throw new AuthServiceError('INVALID_CREDENTIALS');

  const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordResetToken: null, passwordResetExpiry: null },
  });
}

export async function requestAccountDeletion(input: { userId: string; tenantId: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { role: true, passwordHash: true, isActive: true },
  });
  if (!user?.isActive) throw new Error('FORBIDDEN');
  if (user.role !== 'OWNER') throw new Error('FORBIDDEN');

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new AuthServiceError('INVALID_CREDENTIALS');

  await prisma.$transaction([
    prisma.tenant.update({ where: { id: input.tenantId }, data: { deletedAt: new Date() } }),
    prisma.store.updateMany({ where: { tenantId: input.tenantId }, data: { isActive: false } }),
    prisma.user.updateMany({ where: { tenantId: input.tenantId }, data: { isActive: false } }),
  ]);
}

export { getEffectivePermissions };
