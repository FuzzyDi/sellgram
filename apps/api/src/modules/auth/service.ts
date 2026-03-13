import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import type { RegisterInput, LoginInput } from './schema.js';

const SALT_ROUNDS = 12;

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
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
