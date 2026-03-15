import React, { useEffect, useRef, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';

export default function Product({ id }: { id: string }) {
  const { tr } = useMiniI18n();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      api.getProduct(id).then(setProduct).catch(() => {}).finally(() => setLoading(false));
    }
  }, [id]);

  const addToCart = async () => {
    if (!product || adding) return;
    setAdding(true);
    try {
      await api.addToCart(product.id);
      setAdded(true);
      setAddError(null);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setTimeout(() => setAdded(false), 2000);
    } catch (err: any) {
      setAddError(err.message || tr('Ошибка', 'Xatolik'));
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
      setTimeout(() => setAddError(null), 3000);
    }
    setAdding(false);
  };

  const onScroll = () => {
    if (!scrollRef.current) return;
    setImgIdx(Math.round(scrollRef.current.scrollLeft / scrollRef.current.clientWidth));
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: '100%', aspectRatio: '1' }} />
        <div style={{ padding: 16 }}>
          <div className="skeleton" style={{ height: 24, width: '70%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 32, width: '40%' }} />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, color: 'var(--hint)' }}>
        <span style={{ fontSize: 48 }}>😕</span>
        <p style={{ fontWeight: 600 }}>{tr('Товар не найден', 'Mahsulot topilmadi')}</p>
        <button onClick={() => navigate('/')} style={{ color: 'var(--accent)', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          ← {tr('В каталог', 'Katalogga')}
        </button>
      </div>
    );
  }

  const images = product.images || [];
  const inStock = product.stockQty > 0;

  return (
    <div className="anim-fade" style={{ paddingBottom: 88 }}>
      <button onClick={() => navigate('/')} className="pressable" style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', width: 36, height: 36, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>

      {images.length > 0 ? (
        <div style={{ position: 'relative' }}>
          <div ref={scrollRef} onScroll={onScroll} style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
            {images.map((img: any, i: number) => (
              <div key={img.id || i} style={{ flex: '0 0 100%', scrollSnapAlign: 'start', aspectRatio: '1', background: 'var(--sec)' }}>
                <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
          {images.length > 1 && (
            <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
              {images.map((_: any, i: number) => (
                <div key={i} style={{ width: imgIdx === i ? 20 : 6, height: 6, borderRadius: 3, background: imgIdx === i ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ aspectRatio: '1', background: 'var(--sec)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 72, opacity: 0.15 }}>📦</span>
        </div>
      )}

      <div style={{ padding: '16px 16px 8px' }}>
        {product.category && <span className="anim-fade anim-d1" style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-light)', padding: '3px 10px', borderRadius: 8 }}>{product.category.name}</span>}
        <h1 className="anim-fade anim-d2" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginTop: 10 }}>{product.name}</h1>
        <p className="anim-fade anim-d3" style={{ fontSize: 28, fontWeight: 800, marginTop: 12, letterSpacing: -0.5 }}>
          {Number(product.price).toLocaleString()} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--hint)' }}>{tr('сум', "so'm")}</span>
        </p>
        {product.description && <p className="anim-fade anim-d4" style={{ color: 'var(--hint)', marginTop: 16, lineHeight: 1.55, fontSize: 15 }}>{product.description}</p>}
        <div className="anim-fade anim-d5" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--sec)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: inStock ? (product.stockQty > 5 ? 'var(--success)' : 'var(--warning)') : 'var(--danger)' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hint)' }}>
            {!inStock ? tr('Нет в наличии', 'Mavjud emas') : product.stockQty > 5 ? tr('В наличии', 'Mavjud') : tr(`Осталось ${product.stockQty} шт`, `${product.stockQty} ta qoldi`)}
          </span>
        </div>
      </div>

      <div className="glass" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '10px 16px max(env(safe-area-inset-bottom, 0px), 10px)', borderTop: '0.5px solid var(--divider)' }}>
        {addError && (
          <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,59,48,0.1)', color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>
            {addError}
          </div>
        )}
        <button onClick={addToCart} disabled={!inStock || adding} className="pressable" style={{ width: '100%', padding: 16, borderRadius: 'var(--radius)', border: 'none', fontSize: 16, fontWeight: 700, cursor: inStock ? 'pointer' : 'default', background: added ? 'var(--success)' : !inStock ? 'var(--sec)' : 'var(--btn)', color: added ? '#fff' : !inStock ? 'var(--hint)' : 'var(--btn-text)', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
          {added ? tr('✓ В корзине', '✓ Savatda') : adding ? '...' : !inStock ? tr('Нет в наличии', 'Mavjud emas') : `${tr('В корзину', 'Savatga')} · ${Number(product.price).toLocaleString()} ${tr('сум', "so'm")}`}
        </button>
      </div>
    </div>
  );
}
