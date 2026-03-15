import { timingSafeEqual } from 'node:crypto';
import { asObject, normalizeStatus, UnifiedStatus, UnifiedWebhookResult } from './types.js';

export function normalizePaymeWebhook(body: any): UnifiedWebhookResult {
  const payload = asObject(body);
  const params = asObject(payload.params);
  const account = asObject(params.account);
  const method = String(payload.method || '').toLowerCase();

  let status: UnifiedStatus = 'PENDING';
  if (method.includes('perform')) status = 'PAID';
  if (method.includes('cancel')) status = 'REFUNDED';
  if (payload.status !== undefined || params.state !== undefined) {
    status = normalizeStatus(payload.status ?? params.state);
  }

  const paymentRef = String(params.id || params.transaction || payload.id || '').trim() || undefined;
  const eventId = String(payload.id || params.id || [method, params.time].filter(Boolean).join(':')).trim() || undefined;

  const orderId = String(account.orderId || account.order_id || '').trim() || undefined;
  const orderNumberRaw = Number(account.orderNumber || account.order_number || 0);
  const orderNumber = Number.isInteger(orderNumberRaw) && orderNumberRaw > 0 ? orderNumberRaw : undefined;
  const storeId = String(account.storeId || account.store_id || '').trim() || undefined;

  return { status, paymentRef, eventId, orderId, orderNumber, storeId, payload };
}

export function verifyPaymeWebhookAuth(input: {
  headers: Record<string, any>;
  methodMeta: Record<string, any>;
}) {
  const required = String(input.methodMeta.paymeAuthKey || '').trim();
  if (!required) return;

  const auth = String(input.headers['authorization'] || '').trim();
  if (!auth) throw new Error('PAYME auth header is required');

  const expectedBearer = `Bearer ${required}`;
  const expectedBasic = `Basic ${Buffer.from(required).toString('base64')}`;

  const authBuf = Buffer.from(auth);
  const matchBearer =
    authBuf.length === Buffer.from(expectedBearer).length &&
    timingSafeEqual(authBuf, Buffer.from(expectedBearer));
  const matchBasic =
    authBuf.length === Buffer.from(expectedBasic).length &&
    timingSafeEqual(authBuf, Buffer.from(expectedBasic));
  if (!matchBearer && !matchBasic) {
    throw new Error('Invalid PAYME auth header');
  }
}
