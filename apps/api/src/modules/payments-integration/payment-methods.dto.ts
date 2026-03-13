import { z } from 'zod';

export const paymentMethodStoreParamsSchema = z.object({
  id: z.string().min(1),
});

export const paymentMethodParamsSchema = z.object({
  id: z.string().min(1),
  methodId: z.string().min(1),
});

export const createPaymentMethodSchema = z.object({
  provider: z.enum(['CASH', 'MANUAL_TRANSFER', 'TELEGRAM', 'CLICK', 'PAYME', 'UZUM', 'STRIPE', 'CUSTOM']).default('CUSTOM'),
  code: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/i),
  title: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  instructions: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  meta: z.record(z.any()).optional(),
});

export const updatePaymentMethodSchema = createPaymentMethodSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;
export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;
