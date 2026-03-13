import { asObject, normalizeStatus, UnifiedWebhookResult } from './types.js';

export function normalizeGenericWebhook(body: any): UnifiedWebhookResult {
  const payload = asObject(body);
  const orderId = String(payload.orderId || payload.order_id || '').trim() || undefined;
  const orderNumberRaw = Number(payload.orderNumber || payload.order_number || 0);
  const orderNumber = Number.isInteger(orderNumberRaw) && orderNumberRaw > 0 ? orderNumberRaw : undefined;
  const storeId = String(payload.storeId || payload.store_id || '').trim() || undefined;

  return {
    status: normalizeStatus(payload.status),
    paymentRef: String(payload.paymentRef || payload.payment_ref || '').trim() || undefined,
    eventId: String(payload.eventId || payload.event_id || '').trim() || undefined,
    orderId,
    orderNumber,
    storeId,
    payload,
  };
}
