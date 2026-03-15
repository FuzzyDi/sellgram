import React, { useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';

const steps = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED'];

export default function OrderStatus({ id }: { id: string }) {
  const { tr, locale } = useMiniI18n();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const SC = useMemo(() => ({
    NEW: { emoji: '🆕', label: tr('Новый', 'Yangi'), color: 'var(--accent)' },
    CONFIRMED: { emoji: '✅', label: tr('Подтвержден', 'Tasdiqlandi'), color: '#34c759' },
    PREPARING: { emoji: '👨‍🍳', label: tr('Готовится', 'Tayyorlanmoqda'), color: '#ff9500' },
    READY: { emoji: '📦', label: tr('Готов', 'Tayyor'), color: '#af52de' },
    SHIPPED: { emoji: '🚚', label: tr('В пути', "Yo'lda"), color: '#5856d6' },
    DELIVERED: { emoji: '📬', label: tr('Доставлен', 'Yetkazildi'), color: '#30b0c7' },
    COMPLETED: { emoji: '🎉', label: tr('Завершен', 'Yakunlandi'), color: '#34c759' },
    CANCELLED: { emoji: '❌', label: tr('Отменен', 'Bekor qilindi'), color: '#ff3b30' },
    REFUNDED: { emoji: '↩️', label: tr('Возврат', 'Qaytarildi'), color: '#8e8e93' },
  }) as const, [tr]);

  useEffect(() => {
    if (id) api.getOrder(id).then(setOrder).catch(() => setError(true)).finally(() => setLoading(false));
  }, [id]);

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--hint)' }}>
        <span style={{ fontSize: 48 }}>⚠️</span>
        <p style={{ fontWeight: 600, marginTop: 8, color: 'var(--danger)' }}>{tr('Не удалось загрузить заказ', "Buyurtmani yuklab bo'lmadi")}</p>
        <button onClick={() => navigate('/orders')} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{tr('К заказам', 'Buyurtmalarga')}</button>
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
        <button onClick={() => navigate('/orders')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 15, padding: 0, cursor: 'pointer' }}>← {tr('Заказы', 'Buyurtmalar')}</button>
      </div>

      <div className="anim-scale" style={{ margin: '0 12px 16px', padding: '28px 20px', borderRadius: 20, textAlign: 'center', background: `linear-gradient(145deg, ${s.color}12, ${s.color}08)`, border: `1px solid ${s.color}15` }}>
        <div style={{ fontSize: 52, marginBottom: 4 }}>{s.emoji}</div>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>{tr('Заказ', 'Buyurtma')} #{order.orderNumber}</h2>
        <p style={{ color: s.color, fontWeight: 700, fontSize: 15, marginTop: 4 }}>{s.label}</p>
        <p style={{ color: 'var(--hint)', fontSize: 13, marginTop: 6 }}>
          {new Date(order.createdAt).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {!cancelled && (
        <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center' }}>
          {steps.map((step, i) => {
            const done = i <= stepIdx;
            return (
              <React.Fragment key={step}>
                <div style={{ width: done ? 10 : 8, height: done ? 10 : 8, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--accent)' : 'rgba(0,0,0,0.08)', boxShadow: done ? '0 0 0 3px rgba(0,122,255,0.15)' : 'none', transition: 'all 0.3s' }} />
                {i < steps.length - 1 && <div style={{ flex: 1, height: 2, background: i < stepIdx ? 'var(--accent)' : 'rgba(0,0,0,0.06)', transition: 'all 0.3s' }} />}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div style={{ padding: '0 12px' }}>
        <div style={{ background: 'var(--sec)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 12 }}>
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
          <div style={{ background: 'var(--sec)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{tr('Доставка', 'Yetkazish')}</p>
            <p style={{ fontSize: 14 }}>📍 {order.deliveryAddress}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => navigate('/')} className="pressable" style={{ flex: 1, padding: 14, borderRadius: 'var(--radius)', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', background: 'var(--btn)', color: 'var(--btn-text)' }}>{tr('В каталог', 'Katalogga')}</button>
          <button onClick={() => navigate('/orders')} className="pressable" style={{ flex: 1, padding: 14, borderRadius: 'var(--radius)', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', background: 'var(--sec)', color: 'var(--text)' }}>{tr('Все заказы', 'Barcha buyurtmalar')}</button>
        </div>
      </div>
    </div>
  );
}
