import { describe, expect, it } from 'vitest';
import { validateStorePaymentMethodConfig } from './validators.js';

describe('validateStorePaymentMethodConfig', () => {
  it('accepts valid TELEGRAM config', () => {
    expect(() => validateStorePaymentMethodConfig({
      provider: 'TELEGRAM',
      meta: { providerToken: '123:abc', currency: 'uzs' },
    })).not.toThrow();
  });

  it('rejects TELEGRAM config without currency', () => {
    expect(() => validateStorePaymentMethodConfig({
      provider: 'TELEGRAM',
      meta: { providerToken: '123:abc' },
    })).toThrow('TELEGRAM payment requires 3-letter currency in meta.currency (e.g. UZS)');
  });

  it('rejects CLICK config without required keys', () => {
    expect(() => validateStorePaymentMethodConfig({
      provider: 'CLICK',
      meta: { merchantId: 'm1' },
    })).toThrow('CLICK payment requires meta.serviceId');
  });

  it('accepts valid CLICK config', () => {
    expect(() => validateStorePaymentMethodConfig({
      provider: 'CLICK',
      meta: { serviceId: '12', merchantId: 'm1', clickSecret: 'secret' },
    })).not.toThrow();
  });

  it('rejects PAYME config without merchantId', () => {
    expect(() => validateStorePaymentMethodConfig({
      provider: 'PAYME',
      meta: {},
    })).toThrow('PAYME payment requires meta.merchantId');
  });

  it('accepts valid PAYME config', () => {
    expect(() => validateStorePaymentMethodConfig({
      provider: 'PAYME',
      meta: { merchantId: 'merchant-1', paymeAuthKey: 'auth-key' },
    })).not.toThrow();
  });
});
