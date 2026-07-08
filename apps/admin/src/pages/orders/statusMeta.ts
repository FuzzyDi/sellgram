import type { BadgeVariant } from '../../components/Badge';

// Badge variant per order/payment status. Replaces the old statusColors
// hex map (Orders.tsx) — collapses 9 distinct hex colors onto Badge's 5
// semantic variants: info = queued/new, warning = in progress,
// success = finished well, danger = cancelled, neutral = refunded.
export const ORDER_STATUS_VARIANT: Record<string, BadgeVariant> = {
  NEW: 'info',
  CONFIRMED: 'info',
  PREPARING: 'warning',
  READY: 'warning',
  SHIPPED: 'warning',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'neutral',
};

// Matches the original inline logic: PAID -> success, REFUNDED ->
// danger, everything else (PENDING) -> warning.
export const PAYMENT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: 'warning',
  PAID: 'success',
  REFUNDED: 'danger',
};
