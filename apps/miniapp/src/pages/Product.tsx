import React, { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../App';
import { api, getBotUsername, getStoreName } from '../api/client';
import { useMiniI18n } from '../i18n';
import { cartStore } from '../stores/cartStore';
import { useTelegramBackButton } from '../hooks/useTelegramBackButton';
import { setPageMeta } from '../hooks/useMeta';

export default function Product({ id }: { id: string }) {
  const { tr } = useMiniI18n();
  const goBack = useCallback(() => navigate('/'), []);
  useTelegramBackButton(goBack);
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [wishlisted, setWishlisted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviews, setReviews] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const shareProduct = async () => {
    if (!product) return;
    const tg = window.Telegram?.WebApp;
    const botUsername = getBotUsername();
    const text = `${product.name} — ${Number(product.price).toLocaleString()} ${tr('сум', "so'm")}`;
    const deepLink = botUsername
      ? `https://t.me/${botUsername}?start=product_${product.id}`
      : window.location.href;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`
      );
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: product.name, text, url: deepLink }).catch(() => {});
    } else {
      try {
        await navigator.clipboard.writeText(deepLink);
        setCopied(true);
        tg?.HapticFeedback?.notificationOccurred('success');
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    }
  };

  function loadProduct() {
    if (!id) return;
    setLoading(true);
    setFetchError(false);
    setSelectedVariantId(null);
    Promise.all([
      api.getProduct(id),
      api.getWishlist().catch(() => ({ items: [] })),
      api.getProductReviews(id).catch(() => null),
    ]).then(([p, wl, rv]) => {
      setProduct(p);
      const list: any[] = Array.isArray(wl) ? wl : (wl?.items ?? []);
      setWishlisted(list.some((w: any) => w.productId === id || w.product?.id === id));
      setReviews(rv);
      const storeName = getStoreName();
      const title = storeName ? `${p.name} — ${storeName}` : p.name;
      const image = p.images?.[0]?.url;
      setPageMeta(title, p.description || undefined, image || undefined);
    }).catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }

  const toggleWishlist = async () => {
    if (!product) return;
    const next = !wishlisted;
    setWishlisted(next);
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    try {
      if (next) await api.addToWishlist(product.id);
      else await api.removeFromWishlist(product.id);
    } catch { setWishlisted(!next); }
  };

  useEffect(() => { loadProduct(); }, [id]);

  const addToCart = async () => {
    if (!product || adding) return;
    if (hasVariants && !selectedVariantId) return; // must pick a variant
    setAdding(true);
    try {
      await api.addToCart(product.id, selectedVariantId ?? undefined, qty);
      setAdded(true);
      setAddError(null);
      cartStore.inc();
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

  if (fetchError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, padding: 24 }}>
        <span style={{ fontSize: 40 }}>⚠️</span>
        <p style={{ fontWeight: 600, color: 'var(--hint)', textAlign: 'center' }}>{tr('Не удалось загрузить товар', 'Mahsulotni yuklab bo\'lmadi')}</p>
        <button className="btn primary pill" onClick={loadProduct}>
          {tr('Повторить', 'Qayta urinish')}
        </button>
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
  const variants: any[] = (product.variants || []).filter((v: any) => v.isActive);
  const hasVariants = variants.length > 0;
  const selectedVariant = hasVariants ? variants.find((v: any) => v.id === selectedVariantId) ?? null : null;

  const displayPrice = selectedVariant?.price != null ? Number(selectedVariant.price) : Number(product.price);
  const stockQty = selectedVariant ? selectedVariant.stockQty : product.stockQty;
  const inStock = stockQty > 0;

  const btnDisabled = !inStock || adding || (hasVariants && !selectedVariantId);
  const btnLabel = (() => {
    if (added) return tr('✓ В корзине', '✓ Savatda');
    if (adding) return '...';
    if (!inStock) return tr('Нет в наличии', 'Mavjud emas');
    if (hasVariants && !selectedVariantId) return tr('Выберите вариант', 'Variantni tanlang');
    return `${tr('В корзину', 'Savatga')} · ${displayPrice.toLocaleString()} ${tr('сум', "so'm")}`;
  })();

  return (
    <div className="anim-fade" style={{ paddingBottom: 88 }}>
      <button onClick={() => navigate('/')} className="pressable" style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', width: 36, height: 36, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
      <button onClick={shareProduct} className="pressable" style={{ position: 'absolute', top: 12, left: 56, zIndex: 20, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', width: 36, height: 36, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {copied ? '✓' : '↗'}
      </button>
      <button onClick={toggleWishlist} className="pressable" style={{ position: 'absolute', top: 12, left: 100, zIndex: 20, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', color: wishlisted ? '#f43f5e' : '#fff', border: 'none', borderRadius: 'var(--radius-sm)', width: 36, height: 36, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {wishlisted ? '♥' : '♡'}
      </button>

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
          {displayPrice.toLocaleString()} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--hint)' }}>{tr('сум', "so'm")}</span>
        </p>
        {product.description && <p className="anim-fade anim-d4" style={{ color: 'var(--hint)', marginTop: 16, lineHeight: 1.55, fontSize: 15 }}>{product.description}</p>}

        {/* Variant selector */}
        {hasVariants && (
          <div className="anim-fade anim-d4" style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--hint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {(product.category?.attributes?.length > 0
                ? product.category.attributes.map((a: any) => a.name).join(' / ')
                : null) || tr('Вариант', 'Variant')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {variants.map((v: any) => {
                const outOfStock = v.stockQty === 0;
                const selected = selectedVariantId === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariantId(selected ? null : v.id)}
                    disabled={outOfStock}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-sm)',
                      border: selected ? '2px solid var(--btn)' : '1.5px solid var(--divider)',
                      background: selected ? 'var(--btn)' : outOfStock ? 'var(--sec)' : 'var(--bg)',
                      color: selected ? 'var(--btn-text)' : outOfStock ? 'var(--hint)' : 'var(--text)',
                      fontSize: 13, fontWeight: selected ? 700 : 500,
                      cursor: outOfStock ? 'default' : 'pointer',
                      opacity: outOfStock ? 0.5 : 1,
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}
                  >
                    {v.name}
                    {v.price != null && Number(v.price) !== Number(product.price) && (
                      <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.75 }}>
                        {Number(v.price).toLocaleString()}
                      </span>
                    )}
                    {outOfStock && (
                      <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', border: '1.5px solid var(--bg)' }} />
                    )}
                  </button>
                );
              })}
            </div>
            {selectedVariant && selectedVariant.stockQty <= 3 && selectedVariant.stockQty > 0 && (
              <p style={{ fontSize: 12, color: 'var(--warning)', marginTop: 6 }}>
                {tr(`Осталось ${selectedVariant.stockQty} шт`, `${selectedVariant.stockQty} ta qoldi`)}
              </p>
            )}
          </div>
        )}

        {/* Stock indicator (only shown when no variants or variant selected) */}
        {(!hasVariants || selectedVariant) && (
          <div className="anim-fade anim-d5" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--sec)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: inStock ? (stockQty > 5 ? 'var(--success)' : 'var(--warning)') : 'var(--danger)' }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hint)' }}>
              {!inStock ? tr('Нет в наличии', 'Mavjud emas') : stockQty > 5 ? tr('В наличии', 'Mavjud') : tr(`Осталось ${stockQty} шт`, `${stockQty} ta qoldi`)}
            </span>
          </div>
        )}
      </div>

      {/* Reviews */}
      {reviews && reviews.total === 0 && (
        <div style={{ padding: '4px 16px 16px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{tr('Отзывы', 'Sharhlar')}</p>
          <p style={{ fontSize: 13, color: 'var(--hint)' }}>{tr('Отзывов пока нет', 'Hali sharhlar yo\'q')}</p>
        </div>
      )}
      {reviews && reviews.total > 0 && (
        <div style={{ padding: '4px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{tr('Отзывы', 'Sharhlar')}</span>
            <span style={{ display: 'flex', gap: 2 }}>
              {[1,2,3,4,5].map(s => (
                <span key={s} style={{ fontSize: 14, color: s <= Math.round(reviews.avg) ? '#f59e0b' : 'var(--divider)' }}>★</span>
              ))}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>{reviews.avg}</span>
            <span style={{ fontSize: 12, color: 'var(--hint)' }}>({reviews.total})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviews.reviews.slice(0, 5).map((r: any) => {
              const name = r.order?.customer
                ? [r.order.customer.firstName, r.order.customer.lastName].filter(Boolean).join(' ') || r.order.customer.telegramUser || tr('Покупатель', 'Xaridor')
                : tr('Покупатель', 'Xaridor');
              return (
                <div key={r.id} style={{ background: 'var(--sec)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
                    <span style={{ display: 'flex', gap: 1 }}>
                      {[1,2,3,4,5].map(s => (
                        <span key={s} style={{ fontSize: 12, color: s <= r.rating ? '#f59e0b' : 'var(--divider)' }}>★</span>
                      ))}
                    </span>
                  </div>
                  {r.comment && <p style={{ fontSize: 13, color: 'var(--hint)', margin: 0, lineHeight: 1.4 }}>{r.comment}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '10px 16px max(env(safe-area-inset-bottom, 0px), 10px)', borderTop: '0.5px solid var(--divider)' }}>
        {addError && <div className="error-banner" style={{ marginBottom: 8 }}>{addError}</div>}
        {inStock && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 }}>
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid var(--divider)', background: 'var(--sec)', color: 'var(--text)', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >−</button>
            <span style={{ fontSize: 18, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(stockQty, q + 1))}
              style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid var(--divider)', background: 'var(--sec)', color: 'var(--text)', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >+</button>
          </div>
        )}
        <button
          onClick={addToCart}
          disabled={btnDisabled}
          className={`btn full${added ? ' success' : !inStock ? ' secondary' : ' primary'}`}
          style={{ transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)', color: !inStock ? 'var(--hint)' : undefined }}
        >
          {btnLabel}
        </button>
      </div>
    </div>
  );
}
