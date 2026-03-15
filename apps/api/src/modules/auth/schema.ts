import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  tenantName: z.string().min(1),
  tenantSlug: z.string().min(2).regex(/^[\p{L}\p{N}-]+$/u),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshSchema = z.object({
  refreshToken: z.string(),
});

export const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
});

export const changeMyPasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});

export const userPermissionsSchema = z.object({
  manageCatalog: z.boolean().optional(),
  manageOrders: z.boolean().optional(),
  manageCustomers: z.boolean().optional(),
  manageMarketing: z.boolean().optional(),
  manageSettings: z.boolean().optional(),
  manageBilling: z.boolean().optional(),
  manageUsers: z.boolean().optional(),
  viewReports: z.boolean().optional(),
});

export const teamUserCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(120),
  role: z.enum(['MANAGER', 'OPERATOR']).default('OPERATOR'),
  permissions: userPermissionsSchema.optional(),
});

export const teamUserUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['MANAGER', 'OPERATOR']).optional(),
  isActive: z.boolean().optional(),
  permissions: userPermissionsSchema.optional(),
});

export const resetTeamPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
