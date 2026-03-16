import crypto from 'node:crypto';
import { asObject, normalizeStatus, timingSafeEqual, UnifiedWebhookResult } from './types.js';

/**
 * Uzum Bank (formerly Apelsin) webhook normalizer.
 *
 * Uzum sends a JSON payload with transaction details.
 * The merchant_trans_id field should encode either:
 *   - the orderId (cuid) directly, or
 *   - "{storeId}:{orderNumber}" composite key
 *
 * Status mapping:
 *   CONFIRMED / success / 1 / true  → PAID
 *   CANCELLED / REVERSED / REFUNDED → REFUNDED
 *   anything else                   → PENDING
 *
 * Signature: HMAC-SHA256 over "{transaction_id}:{merchant_trans_id}:{amount}" with uzumSecret.
 * Header: X-Uzum-Signature (hex or base64).
 */

function parseMerchantRef(ref: string): { orderId?: string; orderNumber?: number; storeId?: string } {
  const value = String(ref || '').trim();
  if (!value) return {};
  if (/^c[a-z0-9]{20,}$/i.test(value)) return { orderId: value };
  const [store, numberStr] = value.split(':');
  const orderNumber = Number(numberStr);
  if (store && Number.isInteger(orderNumber) && orderNumber > 0) return { storeId: store, orderNumber };
  return {};
}

export function normalizeUzumWebhook(body: any): UnifiedWebhookResult {
  const payload = asObject(body);

  // Status: Uzum uses "CONFIRMED" / "CANCELLED" / numeric or boolean
  const rawStatus = payload.status ?? payload.state ?? payload.result;
  let status = normalizeStatus(rawStatus);
  if (status === 'PENDING') {
    const str = String(rawStatus ?? '').toUpperCase();
    if (str === 'CONFIRMED' || str === 'SUCCESS' || str === 'PAID') status = 'PAID';
    if (str === 'CANCELLED' || str === 'REVERSED' || str === 'REFUNDED' || str === 'VOID') status = 'REFUNDED';
  }

  const paymentRef =
    String(payload.transaction_id || payload.transactionId || payload.uzum_transaction_id || '').trim() || undefined;

  const merchantRef = String(payload.merchant_trans_id || payload.merchantTransId || payload.order_id || payload.orderId || '').trim();
  const extracted = parseMerchantRef(merchantRef);

  const eventId =
    String(payload.event_id || payload.eventId || [paymentRef, merchantRef, payload.amount].filter(Boolean).join(':')).trim() || undefined;

  return { status, paymentRef, eventId, ...extracted, payload };
}

export function verifyUzumWebhookAuth(input: {
  headers: Record<string, any>;
  body: Record<string, any>;
  methodMeta: Record<string, any>;
}) {
  const secret = String(input.methodMeta.uzumSecret || input.methodMeta.webhookSecret || '').trim();
  if (!secret) return;

  const incoming = String(
    input.headers['x-uzum-signature'] ||
    input.headers['x-signature'] ||
    input.body.signature ||
    ''
  ).trim();
  if (!incoming) throw new Error('UZUM signature is required');

  const transactionId = String(input.body.transaction_id || input.body.transactionId || '');
  const merchantRef = String(input.body.merchant_trans_id || input.body.merchantTransId || input.body.order_id || '');
  const amount = String(input.body.amount || '');

  const source = `${transactionId}:${merchantRef}:${amount}`;
  const expected = crypto.createHmac('sha256', secret).update(source).digest('hex');

  if (!timingSafeEqual(incoming.toLowerCase(), expected.toLowerCase())) {
    throw new Error('Invalid UZUM signature');
  }
}
