import React, { useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { BottomNav } from './Catalog';
import { useMiniI18n } from '../i18n';
import { cartStore } from '../stores/cartStore';
import { useOrderStatusConfig } from '../hooks/useOrderStatusConfig';

export default function MyOrders() {
  const { tr, locale } = useMiniI18n();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);

  const SC = useOrderStatusConfig();

  const stores = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of orders) {
      const name = o.store?.name;
      if (name && !seen.has(name)) seen.set(name, name);
    }
    return [...seen.keys()];
  }, [orders]);

  const visibleOrders = useMemo(
    () => storeFilter ? orders.filter((o) => o.store?.name === storeFilter) : orders,
    [orders, storeFilter]
  );

  function load() {
    setLoading(true);
    setError(false);
    api.getOrders().then(setOrders).catch(() => setError(true)).finally(() => setLoading(false));
  }

  async function repeatOrder(e: React.MouseEvent, order: any) {
    e.stopPropagation();
    const items: any[] = order.items ?? [];
    if (!items.length) return;
    // Promise.all rejected the whole batch on the first failure (e.g. one
    // line now out of stock) while earlier items had already been added
    // server-side — the user was told "nothing was added" when some items
    // actually were. allSettled adds what it can and reports accurately.
    const results = await Promise.allSettled(
      items.map((it: any) => api.addToCart(it.productId, it.variantId ?? undefined, it.qty))
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    for (let i = 0; i < succeeded; i++) cartStore.inc();

    if (succeeded === items.length) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      navigate('/cart');
    } else if (succeeded > 0) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
      window.Telegram?.WebApp?.showAlert?.(
        tr(
          `Добавлено ${succeeded} из ${items.length} товаров — остальные недоступны`,
          `${items.length} tadan ${succeeded} tasi qo'shildi — qolganlari mavjud emas`
        )
      );
      navigate('/cart');
    } else {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
      window.Telegram?.WebApp?.showAlert?.(tr('Не удалось добавить товары в корзину', "Mahsulotlarni savatga qo'shib bo'lmadi"));
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="page-pad-sm">
        <div className="skeleton" style={{ height: 28, width: 140, marginBottom: 16 }} />
        {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 8, borderRadius: 'var(--radius)' }} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-error">
        <p className="error-banner" style={{ marginBottom: 12 }}>{tr('Не удалось загрузить заказы', "Buyurtmalarni yuklab bo'lmadi")}</p>
        <button className="btn secondary sm pill" onClick={load}>{tr('Повторить', 'Qayta urinish')}</button>
        <BottomNav active="orders" />
      </div>
    );
  }

  return (
    <div className="anim-fade pb-nav">
      <div className="glass sticky-header" style={{ padding: '12px 16px' }}>
        <div className="row-between">
          <h1 className="page-title">{tr('Заказы', 'Buyurtmalar')}</h1>
          <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} aria-label={tr('Профиль', 'Profil')}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--hint)' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </button>
        </div>
        {stores.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <button
              className={`badge pill pressable${storeFilter === null ? ' active' : ''}`}
              style={{ flexShrink: 0, padding: '4px 12px', cursor: 'pointer', fontWeight: storeFilter === null ? 700 : 400, background: storeFilter === null ? 'var(--accent)' : 'var(--sec)', color: storeFilter === null ? '#fff' : 'var(--fg)', border: 'none' }}
              onClick={() => setStoreFilter(null)}
            >
              {tr('Все', 'Barchasi')}
            </button>
            {stores.map((name) => (
              <button
                key={name}
                className="badge pill pressable"
                style={{ flexShrink: 0, padding: '4px 12px', cursor: 'pointer', fontWeight: storeFilter === name ? 700 : 400, background: storeFilter === name ? 'var(--accent)' : 'var(--sec)', color: storeFilter === name ? '#fff' : 'var(--fg)', border: 'none' }}
                onClick={() => setStoreFilter(storeFilter === name ? null : name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      {orders.length === 0 ? (
        <div className="anim-scale empty-state">
          <div className="empty-icon">📦</div>
          <p style={{ fontSize: 18, fontWeight: 600 }}>{tr('Заказов пока нет', "Hozircha buyurtmalar yo'q")}</p>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>{tr('Самое время сделать первый!', 'Birinchi buyurtma qilish vaqti keldi!')}</p>
        </div>
      ) : (
        <div className="list-pad">
          {visibleOrders.map((o: any, i: number) => {
            const statusKey = String(o.status) as keyof typeof SC;
            const s = SC[statusKey] || SC.NEW;
            return (
              <div key={o.id} onClick={() => navigate(`/order/${o.id}`)} className={`pressable anim-fade anim-d${Math.min(i, 5)}`} style={{ background: 'var(--sec)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 8, cursor: 'pointer' }}>
                <div className="row-between">
                  <span style={{ fontWeight: 700 }}>#{o.orderNumber}</span>
                  <span className="badge" style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>{s.emoji} {s.label}</span>
                </div>
                {o.store?.name && stores.length > 1 && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>🏪 {o.store.name}</div>
                )}
                <p className="muted" style={{ fontSize: 13, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.items?.map((it: any) => `${it.name} x${it.qty}`).join(', ')}
                </p>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 700 }}>{Number(o.total).toLocaleString()} {tr('сум', "so'm")}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 12 }}>{new Date(o.createdAt).toLocaleDateString(locale)}</span>
                    {(o.status === 'COMPLETED' || o.status === 'DELIVERED') && (
                      <button
                        onClick={(e) => repeatOrder(e, o)}
                        className="btn secondary sm pill"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                      >
                        {tr('Повторить', 'Qayta')}
                      </button>
                    )}
                  </div>
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
