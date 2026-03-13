import crypto from 'node:crypto';

export type UnifiedStatus = 'PENDING' | 'PAID' | 'REFUNDED';

export interface UnifiedWebhookResult {
  status: UnifiedStatus;
  paymentRef?: string;
  eventId?: string;
  orderId?: string;
  orderNumber?: number;
  storeId?: string;
  payload: any;
}

export function asObject(input: unknown): Record<string, any> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, any>;
  }
  return {};
}

export function normalizeStatus(raw: unknown): UnifiedStatus {
  const value = String(raw || '').toUpperCase();
  if (value === 'PAID' || value === 'SUCCESS' || value === 'PERFORMED' || value === 'DONE') return 'PAID';
  if (value === 'REFUNDED' || value === 'CANCELLED' || value === 'CANCELED' || value === 'REVERSED') return 'REFUNDED';
  return 'PENDING';
}

export function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
