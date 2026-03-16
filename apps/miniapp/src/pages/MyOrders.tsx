import React, { useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { BottomNav } from './Catalog';
import { useMiniI18n } from '../i18n';

export default function MyOrders() {
  const { tr, locale } = useMiniI18n();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const SC = useMemo(() => ({
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

  function load() {
    setLoading(true);
    setError(false);
    api.getOrders().then(setOrders).catch(() => setError(true)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div className="skeleton" style={{ height: 28, width: 140, marginBottom: 16 }} />
        {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 8, borderRadius: 'var(--radius)' }} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p className="error-banner" style={{ marginBottom: 12 }}>{tr('Не удалось загрузить заказы', "Buyurtmalarni yuklab bo'lmadi")}</p>
        <button className="btn secondary sm pill" onClick={load}>{tr('Повторить', 'Qayta urinish')}</button>
        <BottomNav active="orders" />
      </div>
    );
  }

  return (
    <div className="anim-fade" style={{ paddingBottom: 'calc(var(--nav-h) + 12px)' }}>
      <div className="glass" style={{ position: 'sticky', top: 0, zIndex: 20, padding: 16, borderBottom: '0.5px solid var(--divider)' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{tr('Заказы', 'Buyurtmalar')}</h1>
      </div>
      {orders.length === 0 ? (
        <div className="anim-scale" style={{ textAlign: 'center', padding: '72px 16px' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>📦</div>
          <p style={{ fontSize: 18, fontWeight: 600 }}>{tr('Заказов пока нет', "Hozircha buyurtmalar yo'q")}</p>
          <p style={{ fontSize: 14, color: 'var(--hint)', marginTop: 4 }}>{tr('Самое время сделать первый!', 'Birinchi buyurtma qilish vaqti keldi!')}</p>
        </div>
      ) : (
        <div style={{ padding: '8px 12px' }}>
          {orders.map((o: any, i: number) => {
            const statusKey = String(o.status) as keyof typeof SC;
            const s = SC[statusKey] || SC.NEW;
            return (
              <div key={o.id} onClick={() => navigate(`/order/${o.id}`)} className={`pressable anim-fade anim-d${Math.min(i, 5)}`} style={{ background: 'var(--sec)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>#{o.orderNumber}</span>
                  <span className="badge" style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>{s.emoji} {s.label}</span>
                </div>
                <p style={{ color: 'var(--hint)', fontSize: 13, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.items?.map((it: any) => `${it.name} x${it.qty}`).join(', ')}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontWeight: 700 }}>{Number(o.total).toLocaleString()} {tr('сум', "so'm")}</span>
                  <span style={{ color: 'var(--hint)', fontSize: 12 }}>{new Date(o.createdAt).toLocaleDateString(locale)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <BottomNav active="orders" />
    </div>
  );
}
