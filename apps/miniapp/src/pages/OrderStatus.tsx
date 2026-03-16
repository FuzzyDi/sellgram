import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';
import { useTelegramBackButton } from '../hooks/useTelegramBackButton';

const steps = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
const TERMINAL = new Set(['COMPLETED', 'CANCELLED', 'REFUNDED']);
const POLL_MS = 30_000;

export default function OrderStatus({ id }: { id: string }) {
  const { tr, locale } = useMiniI18n();
  const goBack = useCallback(() => navigate('/orders'), []);
  useTelegramBackButton(goBack);
  const [order, setOrder] = useState<any>(null);
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

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const fetch = (isInitial = false) => {
      if (isInitial) setLoading(true);
      api.getOrder(id)
        .then((o) => { if (!cancelled) setOrder(o); })
        .catch(() => { if (cancelled || !isInitial) return; setError(true); })
        .finally(() => { if (!cancelled && isInitial) setLoading(false); });
    };

    fetch(true);

    // poll every 30s unless order is in a terminal state
    const interval = setInterval(() => {
      if (order && TERMINAL.has(order.status)) return;
      fetch(false);
    }, POLL_MS);

    // refresh immediately when the tab regains focus
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !(order && TERMINAL.has(order.status))) {
        fetch(false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, order?.status]);

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 20, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, padding: 24 }}>
        <span style={{ fontSize: 48 }}>⚠️</span>
        <p className="error-banner">{tr('Не удалось загрузить заказ', "Buyurtmani yuklab bo'lmadi")}</p>
        <button className="btn secondary pill" onClick={() => navigate('/orders')}>{tr('К заказам', 'Buyurtmalarga')}</button>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--hint)' }}>
        <span style={{ fontSize: 48 }}>😕</span>
        <p style={{ fontWeight: 600, marginTop: 8 }}>{tr('Заказ не найден', 'Buyurtma topilmadi')}</p>
      </div>
    );
  }

  const statusKey = String(order.status) as keyof typeof SC;
  const s = SC[statusKey] || SC.NEW;
  const stepIdx = steps.indexOf(order.status);
  const cancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';

  return (
    <div className="anim-fade" style={{ padding: '0 0 24px' }}>
      <div style={{ padding: 16 }}>
        <button className="btn ghost xs" onClick={() => navigate('/orders')}>← {tr('Заказы', 'Buyurtmalar')}</button>
      </div>

      <div className="anim-scale" style={{ margin: '0 12px 16px', padding: '28px 20px', borderRadius: 20, textAlign: 'center', background: `linear-gradient(145deg, color-mix(in srgb, ${s.color} 8%, transparent), color-mix(in srgb, ${s.color} 5%, transparent))`, border: `1px solid color-mix(in srgb, ${s.color} 15%, transparent)` }}>
        <div style={{ fontSize: 52, marginBottom: 4 }}>{s.emoji}</div>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>{tr('Заказ', 'Buyurtma')} #{order.orderNumber}</h2>
        <p style={{ color: s.color, fontWeight: 700, fontSize: 15, marginTop: 4 }}>{s.label}</p>
        <p style={{ color: 'var(--hint)', fontSize: 13, marginTop: 6 }}>
          {new Date(order.createdAt).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {!cancelled && (
        <div className="progress-track">
          {steps.map((step, i) => {
            const done = i <= stepIdx;
            return (
              <React.Fragment key={step}>
                <div className={`progress-dot${done ? ' done' : ''}`} />
                {i < steps.length - 1 && <div className={`progress-line${i < stepIdx ? ' done' : ''}`} />}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div style={{ padding: '0 12px' }}>
        <div className="card" style={{ marginBottom: 12 }}>
          {order.items?.map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < order.items.length - 1 ? '1px solid var(--divider)' : 'none' }}>
              <div>
                <p style={{ fontWeight: 500, fontSize: 14 }}>{item.name}</p>
                <p style={{ color: 'var(--hint)', fontSize: 12, marginTop: 1 }}>{item.qty} x {Number(item.price).toLocaleString()}</p>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{Number(item.total).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--divider)', marginTop: 4, paddingTop: 10 }}>
            {Number(order.deliveryPrice) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--hint)', marginBottom: 4 }}><span>{tr('Доставка', 'Yetkazish')}</span><span>{Number(order.deliveryPrice).toLocaleString()} {tr('сум', "so'm")}</span></div>}
            {Number(order.loyaltyDiscount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--success)', marginBottom: 4 }}><span>{tr('Скидка баллами', 'Ballar chegirmasi')}</span><span>−{Number(order.loyaltyDiscount).toLocaleString()} {tr('сум', "so'm")}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}><span>{tr('Итого', 'Jami')}</span><span>{Number(order.total).toLocaleString()} {tr('сум', "so'm")}</span></div>
          </div>
        </div>

        {order.deliveryAddress && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p className="section-title">{tr('Доставка', 'Yetkazish')}</p>
            <p style={{ fontSize: 14 }}>📍 {order.deliveryAddress}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => navigate('/')} className="btn primary" style={{ flex: 1 }}>{tr('В каталог', 'Katalogga')}</button>
          <button onClick={() => navigate('/orders')} className="btn secondary" style={{ flex: 1 }}>{tr('Все заказы', 'Barcha buyurtmalar')}</button>
        </div>
      </div>
    </div>
  );
}
