import React, { useCallback, useEffect, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';
import { cartStore } from '../stores/cartStore';
import { useTelegramBackButton } from '../hooks/useTelegramBackButton';

export default function Wishlist() {
  const { tr } = useMiniI18n();
  const goBack = useCallback(() => navigate('/'), []);
  useTelegramBackButton(goBack);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    api.getWishlist()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const removeFromWishlist = async (productId: string) => {
    await api.removeFromWishlist(productId).catch(() => {});
    setItems((prev) => prev.filter((i) => i.productId !== productId && i.product?.id !== productId));
  };

  const addToCart = async (productId: string) => {
    setAdding(productId);
    try {
      await api.addToCart(productId);
      cartStore.inc();
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch {}
    setAdding(null);
  };

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12, marginBottom: 10 }} />)}
      </div>
    );
  }

  return (
    <div className="anim-fade" style={{ padding: 16, paddingBottom: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>
        {tr('Избранное', 'Sevimlilар')}
      </h2>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--hint)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>♡</div>
          <p style={{ fontWeight: 600, margin: '0 0 16px' }}>{tr('Избранное пусто', 'Sevimlilар bo\'sh')}</p>
          <button className="btn primary pill" onClick={() => navigate('/')}>
            {tr('В каталог', 'Katalogga')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => {
          const product = item.product ?? {};
          const image = product.images?.[0]?.url;
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--sec)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
              <div onClick={() => navigate(`/product/${product.id}`)} style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--divider)', overflow: 'hidden', flexShrink: 0 }}>
                {image && <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div onClick={() => navigate(`/product/${product.id}`)} style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--hint)' }}>{Number(product.price).toLocaleString()} {tr('сум', "so'm")}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => addToCart(product.id)}
                  disabled={adding === product.id}
                  className="btn primary"
                  style={{ padding: '6px 12px', fontSize: 13 }}
                >
                  {adding === product.id ? '...' : tr('В корзину', 'Savatga')}
                </button>
                <button
                  onClick={() => removeFromWishlist(product.id)}
                  style={{ background: 'none', border: 'none', color: '#f43f5e', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}
                >♥</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
