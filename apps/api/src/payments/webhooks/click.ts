import crypto from 'node:crypto';
import { asObject, normalizeStatus, timingSafeEqual, UnifiedWebhookResult } from './types.js';

function parseMerchantOrderRef(ref: string): { orderId?: string; orderNumber?: number; storeId?: string } {
  const value = String(ref || '').trim();
  if (!value) return {};

  if (/^c[a-z0-9]{20,}$/i.test(value)) {
    return { orderId: value };
  }

  const [store, numberStr] = value.split(':');
  const orderNumber = Number(numberStr);
  if (store && Number.isInteger(orderNumber) && orderNumber > 0) {
    return { storeId: store, orderNumber };
  }

  return {};
}

export function normalizeClickWebhook(body: any): UnifiedWebhookResult {
  const payload = asObject(body);
  const status =
    payload.status !== undefined
      ? normalizeStatus(payload.status)
      : Number(payload.error) === 0
        ? 'PAID'
        : 'PENDING';

  const paymentRef =
    String(payload.click_trans_id || payload.payment_id || payload.merchant_prepare_id || payload.merchant_confirm_id || '').trim() ||
    undefined;

  const eventId =
    String(payload.event_id || [payload.service_id, paymentRef, payload.sign_time].filter(Boolean).join(':')).trim() ||
    undefined;

  const extracted = parseMerchantOrderRef(String(payload.merchant_trans_id || payload.order_ref || ''));

  return { status, paymentRef, eventId, ...extracted, payload };
}

export function verifyClickWebhookAuth(input: {
  headers: Record<string, any>;
  body: Record<string, any>;
  methodMeta: Record<string, any>;
}) {
  const secret = String(input.methodMeta.clickSecret || input.methodMeta.signatureSecret || '').trim();
  if (!secret) return;

  const incoming = String(input.headers['x-click-signature'] || input.body.sign || input.body.signature || '').trim();
  if (!incoming) throw new Error('CLICK signature is required');

  const source = String(
    input.body.sign_source || [input.body.click_trans_id, input.body.service_id, input.body.merchant_trans_id, input.body.amount, input.body.action, input.body.sign_time].join(':')
  ).trim();
  const expected = crypto.createHmac('sha256', secret).update(source).digest('hex');

  if (!timingSafeEqual(incoming.toLowerCase(), expected.toLowerCase())) {
    throw new Error('Invalid CLICK signature');
  }
}
