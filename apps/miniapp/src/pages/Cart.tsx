import React, { useEffect, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { BottomNav } from './Catalog';
import { useMiniI18n } from '../i18n';

export default function Cart() {
  const { tr } = useMiniI18n();
  const [cart, setCart] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadCart = () => {
    setLoading(true);
    api.getCart().then(setCart).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(loadCart, []);

  const updateQty = async (id: string, qty: number) => {
    try {
      if (qty <= 0) await api.removeCartItem(id);
      else await api.updateCartItem(id, qty);
      loadCart();
    } catch {}
  };

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div className="skeleton" style={{ height: 28, width: 100, marginBottom: 16 }} />
        {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72, marginBottom: 8, borderRadius: 'var(--radius)' }} />)}
      </div>
    );
  }

  const items = cart?.items || [];

  return (
    <div className="anim-fade" style={{ paddingBottom: items.length ? 'calc(var(--nav-h) + 80px)' : 'calc(var(--nav-h) + 12px)' }}>
      <div className="glass" style={{ position: 'sticky', top: 0, zIndex: 20, padding: 16, borderBottom: '0.5px solid var(--divider)' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{tr('Корзина', 'Savat')}</h1>
      </div>

      {items.length === 0 ? (
        <div className="anim-scale" style={{ textAlign: 'center', padding: '72px 16px' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🛒</div>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{tr('Корзина пуста', "Savat bo'sh")}</p>
          <p style={{ fontSize: 14, color: 'var(--hint)', marginBottom: 20 }}>{tr('Добавьте товары из каталога', "Katalogdan mahsulot qo'shing")}</p>
          <button onClick={() => navigate('/')} className="pressable" style={{ padding: '10px 24px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            {tr('В каталог', 'Katalogga')}
          </button>
        </div>
      ) : (
        <div style={{ padding: '8px 12px' }}>
          {items.map((item: any, i: number) => (
            <div key={item.id} className={`anim-fade anim-d${Math.min(i, 5)}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--sec)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
              <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', background: 'var(--sec)', overflow: 'hidden', flexShrink: 0 }}>
                {item.image ? <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span>📦</span></div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                <p style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{item.price.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--hint)' }}>{tr('сум', "so'm")}</span></p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => updateQty(item.id, item.qty - 1)} className="pressable" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontWeight: 700, fontSize: 15, minWidth: 24, textAlign: 'center' }}>{item.qty}</span>
                <button onClick={() => updateQty(item.id, item.qty + 1)} className="pressable" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="glass" style={{ position: 'fixed', bottom: 'var(--nav-h)', left: 0, right: 0, zIndex: 30, padding: '10px 16px 10px', borderTop: '0.5px solid var(--divider)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 15, color: 'var(--hint)' }}>{items.length} {tr('товар(ов)', 'ta mahsulot')}</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{cart.subtotal?.toLocaleString()} {tr('сум', "so'm")}</span>
          </div>
          <button onClick={() => navigate('/checkout')} className="pressable" style={{ width: '100%', padding: 15, borderRadius: 'var(--radius)', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'var(--btn)', color: 'var(--btn-text)' }}>
            {tr('Оформить заказ', 'Buyurtma berish')}
          </button>
        </div>
      )}

      <BottomNav active="cart" />
    </div>
  );
}
