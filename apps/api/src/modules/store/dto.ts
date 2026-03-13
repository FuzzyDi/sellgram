import { z } from 'zod';

export const createStoreSchema = z.object({
  name: z.string().min(1),
  botToken: z.string().min(10),
  welcomeMessage: z.string().optional(),
});

export const updateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  botToken: z.string().min(10).optional(),
  welcomeMessage: z.string().optional(),
  miniAppUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export const storeIdParamSchema = z.object({
  id: z.string().min(1),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
