import { z } from 'zod';

export const checkoutSchema = z.object({
  deliveryType: z.enum(['PICKUP', 'LOCAL', 'NATIONAL']),
  deliveryZoneId: z.string().optional(),
  deliveryAddress: z.string().optional(),
  loyaltyPointsToUse: z.number().int().min(0).default(0),
  note: z.string().optional(),
  contactPhone: z.string().optional(),
  paymentMethodId: z.string().optional(),
  promoCodeId: z.string().optional(),
  referralCode: z.string().max(20).optional(),
});

export const cartAddSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  qty: z.number().int().min(1).max(100).default(1),
});

export const cartUpdateQtySchema = z.object({
  qty: z.number().int().min(0).max(100),
});

export const itemIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const reviewOrderSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CartAddInput = z.infer<typeof cartAddSchema>;
export type CartUpdateQtyInput = z.infer<typeof cartUpdateQtySchema>;
export type ItemIdParams = z.infer<typeof itemIdParamsSchema>;
