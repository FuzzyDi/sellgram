import { z } from 'zod';

export const subscriptionUpgradeSchema = z.object({
  plan: z.enum(['FREE', 'PRO', 'BUSINESS']),
});

export const subscriptionInvoicePayParamsSchema = z.object({
  id: z.string().min(1),
});

export const subscriptionInvoicePayBodySchema = z.object({
  paymentRef: z.string().min(1),
  paymentNote: z.string().optional(),
});
