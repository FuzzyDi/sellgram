import { normalizeClickWebhook, verifyClickWebhookAuth } from './webhooks/click.js';
import { normalizeGenericWebhook } from './webhooks/generic.js';
import { normalizePaymeWebhook, verifyPaymeWebhookAuth } from './webhooks/payme.js';
import { normalizeUzumWebhook, verifyUzumWebhookAuth } from './webhooks/uzum.js';
import { asObject, UnifiedWebhookResult } from './webhooks/types.js';

export type { UnifiedWebhookResult } from './webhooks/types.js';

export function normalizeProviderWebhook(provider: string, body: any): UnifiedWebhookResult {
  const upper = String(provider || '').toUpperCase();
  if (upper === 'CLICK') return normalizeClickWebhook(body);
  if (upper === 'PAYME') return normalizePaymeWebhook(body);
  if (upper === 'UZUM') return normalizeUzumWebhook(body);
  return normalizeGenericWebhook(body);
}

export function verifyProviderWebhookAuth(input: {
  provider: string;
  headers: Record<string, any>;
  body: Record<string, any>;
  methodMeta?: Record<string, any>;
}) {
  const provider = String(input.provider || '').toUpperCase();
  const meta = asObject(input.methodMeta);

  if (provider === 'CLICK') {
    verifyClickWebhookAuth({ headers: input.headers, body: input.body, methodMeta: meta });
    return;
  }

  if (provider === 'PAYME') {
    verifyPaymeWebhookAuth({ headers: input.headers, methodMeta: meta });
    return;
  }

  if (provider === 'UZUM') {
    verifyUzumWebhookAuth({ headers: input.headers, body: input.body, methodMeta: meta });
    return;
  }
}
