import { useMemo } from 'react';
import { useMiniI18n } from '../i18n';

// Shared by OrderStatus.tsx and MyOrders.tsx — was defined identically,
// byte-for-byte, in both files; a status added/renamed in one would
// silently drift from the other.
export function useOrderStatusConfig() {
  const { tr } = useMiniI18n();

  return useMemo(() => ({
    NEW:       { emoji: '🆕', label: tr('Новый', 'Yangi'),               color: 'var(--status-new)' },
    CONFIRMED: { emoji: '✅', label: tr('Подтвержден', 'Tasdiqlandi'),    color: 'var(--status-confirmed)' },
    PREPARING: { emoji: '👨‍🍳', label: tr('Готовится', 'Tayyorlanmoqda'), color: 'var(--status-preparing)' },
    READY:     { emoji: '📦', label: tr('Готов', 'Tayyor'),               color: 'var(--status-ready)' },
    SHIPPED:   { emoji: '🚚', label: tr('В пути', "Yo'lda"),              color: 'var(--status-shipped)' },
    DELIVERED: { emoji: '📬', label: tr('Доставлен', 'Yetkazildi'),       color: 'var(--status-delivered)' },
    COMPLETED: { emoji: '🎉', label: tr('Завершен', 'Yakunlandi'),        color: 'var(--status-completed)' },
    CANCELLED: { emoji: '❌', label: tr('Отменен', 'Bekor qilindi'),      color: 'var(--status-cancelled)' },
    REFUNDED:  { emoji: '↩️', label: tr('Возврат', 'Qaytarildi'),         color: 'var(--status-refunded)' },
  }) as const, [tr]);
}
