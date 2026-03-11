import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  SYSTEM_JWT_SECRET: z.string().min(16).optional(),
  SYSTEM_ADMIN_EMAIL: z.string().email().optional(),
  SYSTEM_ADMIN_PASSWORD: z.string().min(8).optional(),
  ALLOW_DEV_AUTH_BYPASS: z.coerce.boolean().default(false),
  MINIAPP_INITDATA_MAX_AGE_SEC: z.coerce.number().int().positive().default(600),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('sellgram'),
  S3_REGION: z.string().default('us-east-1'),
  ENCRYPTION_KEY: z.string().min(32),
  APP_URL: z.string().default('https://api.sellgram.uz'),
  ADMIN_URL: z.string().default('https://app.sellgram.uz'),
  MINIAPP_URL: z.string().default('https://miniapp.sellgram.uz'),
  LANDING_URL: z.string().default('https://sellgram.uz'),
  SUPPORT_EMAIL: z.string().email().default('support@sellgram.uz'),
  PRIVACY_EMAIL: z.string().email().default('privacy@sellgram.uz'),
  BILLING_EMAIL: z.string().email().default('billing@sellgram.uz'),
  LEGAL_ENTITY_NAME: z.string().default('OOO SellGram'),
  LEGAL_ENTITY_SHORT_NAME: z.string().default('SellGram'),
  LEGAL_ENTITY_ADDRESS: z.string().default('Tashkent, Uzbekistan'),
  LEGAL_ENTITY_INN: z.string().default('XXXXXXXXX'),
  BILLING_BANK_NAME: z.string().default('Капиталбанк'),
  BILLING_BANK_ACCOUNT: z.string().default('2020 8000 9051 XXXX XXXX'),
  BILLING_RECIPIENT: z.string().default('ООО "SellGram"'),
  BILLING_INN: z.string().default('XXXXXXXXX'),
  BILLING_MFO: z.string().default('XXXXX'),
  BILLING_PAYMENT_NOTE: z.string().default('Оплата подписки SellGram'),
  GA_MEASUREMENT_ID: z.string().optional(),
  YANDEX_METRIKA_ID: z.string().optional(),
  API_PORT: z.coerce.number().default(4000),
  TRUST_PROXY: z.coerce.boolean().default(false),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
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
