import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeProviderWebhook, verifyProviderWebhookAuth } from './webhooks.js';

describe('normalizeProviderWebhook', () => {
  it('normalizes CLICK payload with merchant_trans_id storeId:orderNumber', () => {
    const result = normalizeProviderWebhook('click', {
      merchant_trans_id: 'store_123:42',
      click_trans_id: 'tx-1',
      error: 0,
      sign_time: '1710000000',
      service_id: '77',
    });

    expect(result.status).toBe('PAID');
    expect(result.paymentRef).toBe('tx-1');
    expect(result.storeId).toBe('store_123');
    expect(result.orderNumber).toBe(42);
    expect(result.eventId).toContain('77');
  });

  it('normalizes PAYME payload with account mapping', () => {
    const result = normalizeProviderWebhook('PAYME', {
      method: 'PerformTransaction',
      params: {
        id: 'payme-1',
        account: {
          storeId: 'store_999',
          orderNumber: 15,
        },
      },
    });

    expect(result.status).toBe('PAID');
    expect(result.paymentRef).toBe('payme-1');
    expect(result.storeId).toBe('store_999');
    expect(result.orderNumber).toBe(15);
  });

  it('falls back to generic normalization', () => {
    const result = normalizeProviderWebhook('custom', {
      status: 'refunded',
      payment_ref: 'abc',
      event_id: 'evt-1',
      order_id: 'order-1',
    });

    expect(result.status).toBe('REFUNDED');
    expect(result.paymentRef).toBe('abc');
    expect(result.eventId).toBe('evt-1');
    expect(result.orderId).toBe('order-1');
  });
});

describe('verifyProviderWebhookAuth', () => {
  it('validates CLICK signature', () => {
    const body = {
      click_trans_id: 'c-1',
      service_id: '12',
      merchant_trans_id: 'store_1:1',
      amount: '5000',
      action: '0',
      sign_time: '1710000000',
    };

    const secret = 'click-secret';
    const source = `${body.click_trans_id}:${body.service_id}:${body.merchant_trans_id}:${body.amount}:${body.action}:${body.sign_time}`;
    const signature = crypto.createHmac('sha256', secret).update(source).digest('hex');

    expect(() => verifyProviderWebhookAuth({
      provider: 'CLICK',
      headers: { 'x-click-signature': signature },
      body,
      methodMeta: { clickSecret: secret },
    })).not.toThrow();
  });

  it('rejects invalid CLICK signature', () => {
    expect(() => verifyProviderWebhookAuth({
      provider: 'CLICK',
      headers: { 'x-click-signature': 'invalid' },
      body: {
        click_trans_id: 'c-1',
        service_id: '12',
        merchant_trans_id: 'store_1:1',
        amount: '5000',
        action: '0',
        sign_time: '1710000000',
      },
      methodMeta: { clickSecret: 'click-secret' },
    })).toThrow('Invalid CLICK signature');
  });

  it('accepts PAYME bearer authorization', () => {
    expect(() => verifyProviderWebhookAuth({
      provider: 'PAYME',
      headers: { authorization: 'Bearer payme-key' },
      body: {},
      methodMeta: { paymeAuthKey: 'payme-key' },
    })).not.toThrow();
  });

  it('accepts PAYME basic authorization', () => {
    const token = Buffer.from('payme-key').toString('base64');

    expect(() => verifyProviderWebhookAuth({
      provider: 'PAYME',
      headers: { authorization: `Basic ${token}` },
      body: {},
      methodMeta: { paymeAuthKey: 'payme-key' },
    })).not.toThrow();
  });

  it('rejects PAYME authorization mismatch', () => {
    expect(() => verifyProviderWebhookAuth({
      provider: 'PAYME',
      headers: { authorization: 'Bearer wrong' },
      body: {},
      methodMeta: { paymeAuthKey: 'payme-key' },
    })).toThrow('Invalid PAYME auth header');
  });
});
