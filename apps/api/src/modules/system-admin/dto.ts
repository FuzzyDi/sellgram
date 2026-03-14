import { z } from 'zod';

export const systemAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const systemAdminTenantListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().optional(),
});

export const systemAdminStoreListQuerySchema = z.object({
  tenantId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const systemAdminIdParamSchema = z.object({
  id: z.string().min(1),
});

export const systemAdminUpdateTenantPlanSchema = z.object({
  plan: z.enum(['FREE', 'PRO', 'BUSINESS']),
  planExpiresAt: z.string().datetime().optional(),
});

export const systemAdminInvoiceListQuerySchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'CANCELLED', 'EXPIRED']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const systemAdminActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(30),
  action: z.enum(['TENANT_PLAN_UPDATED', 'INVOICE_CONFIRMED', 'INVOICE_REJECTED']).optional(),
  targetType: z.enum(['tenant', 'invoice']).optional(),
  search: z.string().trim().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export const systemAdminReminderSettingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  days: z.array(z.coerce.number().int().min(1).max(30)).min(1).max(10).optional(),
});