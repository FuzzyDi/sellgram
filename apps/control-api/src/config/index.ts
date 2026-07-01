import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('sellgram'),
  S3_REGION: z.string().default('us-east-1'),
  ADMIN_URL: z.string().default('https://app.sellgram.uz'),
  SYSTEM_JWT_SECRET: z.string().min(16).optional(),
  JWT_SECRET: z.string().min(16).optional(),
  SYSTEM_ADMIN_EMAIL: z.string().email().optional(),
  SYSTEM_ADMIN_PASSWORD: z.string().min(8).optional(),
  CONTROL_API_PORT: z.coerce.number().default(4100),
  TRUST_PROXY: z.coerce.boolean().default(false),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof envSchema>;

let config: Config;

export function loadConfig(): Config {
  config = envSchema.parse(process.env);
  return config;
}

export function getConfig(): Config {
  if (!config) throw new Error('Config not loaded. Call loadConfig() first.');
  return config;
}
