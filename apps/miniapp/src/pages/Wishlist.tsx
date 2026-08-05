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
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    api.getWishlist()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeFromWishlist = async (productId: string) => {
    try {
      await api.removeFromWishlist(productId);
      setItems((prev) => prev.filter((i) => i.productId !== productId && i.product?.id !== productId));
    } catch {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
  };

  const addToCart = async (productId: string) => {
    setAdding(productId);
    try {
      await api.addToCart(productId);
      cartStore.inc();
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
    setAdding(null);
  };

  if (loading) {
    return (
      <div className="page-pad-sm">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12, marginBottom: 10 }} />)}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-error">
        <p className="error-banner" style={{ marginBottom: 12 }}>{tr('Не удалось загрузить избранное', "Sevimlilarni yuklab bo'lmadi")}</p>
        <button className="btn secondary sm pill" onClick={load}>{tr('Повторить', 'Qayta urinish')}</button>
      </div>
    );
  }

  return (
    <div className="anim-fade page-pad-sm">
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>
        {tr('Избранное', 'Sevimlilар')}
      </h2>

      {items.length === 0 && (
        <div className="muted" style={{ textAlign: 'center', padding: '48px 16px' }}>
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
            <div key={item.id} className="row-card" style={{ marginBottom: 0, cursor: 'pointer' }}>
              <div onClick={() => navigate(`/product/${product.id}`)} className="thumb">
                {image && <img src={image} alt="" />}
              </div>
              <div onClick={() => navigate(`/product/${product.id}`)} className="flex-fill">
                <p className="row-title" style={{ margin: 0 }}>{product.name}</p>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{Number(product.price).toLocaleString()} {tr('сум', "so'm")}</p>
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
