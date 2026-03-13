import { StoreProviderCode } from './types.js';

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(meta: Record<string, any>, key: string): string {
  const raw = meta[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function requireMetaObject(provider: string, meta: unknown): Record<string, any> {
  if (!isRecord(meta)) {
    throw new Error(`${provider} payment requires meta object`);
  }
  return meta;
}

function requireNonEmpty(meta: Record<string, any>, key: string, message: string) {
  if (!readString(meta, key)) {
    throw new Error(message);
  }
}

function validateOptionalSecret(meta: Record<string, any>, key: string, message: string) {
  const value = meta[key];
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message);
  }
}

export function validateStorePaymentMethodConfig(input: {
  provider?: string;
  meta?: unknown;
}) {
  const provider = (input.provider || 'CUSTOM') as StoreProviderCode;

  if (provider === 'TELEGRAM') {
    const meta = requireMetaObject('TELEGRAM', input.meta);
    const providerToken = readString(meta, 'providerToken');
    const currency = readString(meta, 'currency').toUpperCase();

    if (!providerToken) {
      throw new Error('TELEGRAM payment requires meta.providerToken');
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error('TELEGRAM payment requires 3-letter currency in meta.currency (e.g. UZS)');
    }
  }

  if (provider === 'CLICK') {
    const meta = requireMetaObject('CLICK', input.meta);
    requireNonEmpty(meta, 'serviceId', 'CLICK payment requires meta.serviceId');
    requireNonEmpty(meta, 'merchantId', 'CLICK payment requires meta.merchantId');
    validateOptionalSecret(meta, 'clickSecret', 'CLICK payment meta.clickSecret must be a non-empty string');
    validateOptionalSecret(meta, 'webhookSecret', 'CLICK payment meta.webhookSecret must be a non-empty string');
  }

  if (provider === 'PAYME') {
    const meta = requireMetaObject('PAYME', input.meta);
    requireNonEmpty(meta, 'merchantId', 'PAYME payment requires meta.merchantId');
    validateOptionalSecret(meta, 'paymeAuthKey', 'PAYME payment meta.paymeAuthKey must be a non-empty string');
    validateOptionalSecret(meta, 'webhookSecret', 'PAYME payment meta.webhookSecret must be a non-empty string');
  }
}
