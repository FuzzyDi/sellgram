import React, { useEffect, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';
import { cartStore } from '../stores/cartStore';

interface Product {
  id: string;
  name: string;
  price: string;
  images: Array<{ url: string }>;
  category?: { id: string; name: string };
  stockQty: number;
}

interface Category {
  id: string;
  name: string;
  _count: { products: number };
}

export default function Catalog() {
  const { tr } = useMiniI18n();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    api.getCatalog()
      .then((d) => {
        setCategories(d.categories || []);
        setProducts(d.products || []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = products.filter((p) =>
    (!selected || p.category?.id === selected) &&
    (!q || p.name.toLowerCase().includes(q))
  );

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ fontSize: 40, marginBottom: 12 }}>⚠️</p>
        <p style={{ fontWeight: 600, color: 'var(--hint)', marginBottom: 20 }}>{tr('Не удалось загрузить каталог', 'Katalogni yuklab bo`lmadi')}</p>
        <button className="btn primary pill" onClick={load}>
          {tr('Повторить', 'Qayta urinish')}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div className="skeleton" style={{ height: 28, width: 120, marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[80, 60, 70].map((w, i) => <div key={i} className="skeleton" style={{ height: 34, width: w, borderRadius: 17 }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 220, borderRadius: 'var(--radius)' }} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 'calc(var(--nav-h) + 12px)' }}>
      <div className="glass" style={{ position: 'sticky', top: 0, zIndex: 20, padding: '16px 16px 0', borderBottom: '0.5px solid var(--divider)' }}>
        <h1 className="anim-fade" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{tr('Каталог', 'Katalog')}</h1>
        <div className="anim-fade anim-d1" style={{ position: 'relative', padding: '10px 0 4px' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, stroke: 'var(--hint)', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            className="field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('Поиск товаров...', 'Mahsulot qidirish...')}
            style={{ paddingLeft: 36, paddingTop: 10, paddingBottom: 10 }}
          />
        </div>
        <div className="anim-fade anim-d2" style={{ display: 'flex', gap: 6, padding: '8px 0 12px', overflowX: 'auto' }}>
          <button className={`chip${!selected ? ' active' : ''}`} onClick={() => setSelected(null)}>{tr('Все', 'Barchasi')}</button>
          {categories.map((c) => (
            <button key={c.id} className={`chip${selected === c.id ? ' active' : ''}`} onClick={() => setSelected(c.id)}>{c.name}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 12px' }}>
        {filtered.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
      </div>

      {filtered.length === 0 && (
        <div className="anim-scale" style={{ textAlign: 'center', padding: '64px 16px' }}>
          <p style={{ fontSize: 44, marginBottom: 8 }}>🔎</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--hint)' }}>{tr('Товары не найдены', 'Mahsulotlar topilmadi')}</p>
        </div>
      )}

      <BottomNav active="catalog" />
    </div>
  );
}

function ProductCard({ product: p, index }: { product: Product; index: number }) {
  const { tr } = useMiniI18n();
  const delay = Math.min(index, 5);
  const outOfStock = p.stockQty === 0;
  const [adding, setAdding] = React.useState(false);
  const [added, setAdded] = React.useState(false);

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (outOfStock || adding) return;
    setAdding(true);
    try {
      const { api } = await import('../api/client');
      await api.addToCart(p.id);
      cartStore.inc();
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    } catch {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
    setAdding(false);
  };

  return (
    <div onClick={() => navigate(`/product/${p.id}`)} className={`product-card anim-fade anim-d${delay}`} style={{ opacity: outOfStock ? 0.62 : 1 }}>
      <div style={{ aspectRatio: '1', background: 'var(--sec)', position: 'relative', overflow: 'hidden' }}>
        {p.images[0]?.url ? (
          <img src={p.images[0].url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: outOfStock ? 'grayscale(0.4)' : 'none' }} loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 36, opacity: 0.25 }}>📦</span></div>
        )}
        {outOfStock ? (
          <span style={{ position: 'absolute', top: 8, right: 8, padding: '3px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
            {tr('Нет', 'Yo\'q')}
          </span>
        ) : p.stockQty <= 3 && (
          <span style={{ position: 'absolute', top: 8, right: 8, padding: '3px 8px', borderRadius: 8, background: 'rgba(255,149,0,0.9)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
            {tr('Мало', 'Kam')}
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <h3 style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 6 }}>
          <p style={{ fontWeight: 700, fontSize: 15, color: outOfStock ? 'var(--hint)' : 'var(--text)', margin: 0 }}>
            {Number(p.price).toLocaleString()} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--hint)' }}>{tr('сум', "so'm")}</span>
          </p>
          {!outOfStock && (
            <button
              onClick={handleAdd}
              disabled={adding}
              style={{
                width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
                background: added ? 'var(--success)' : 'var(--btn)',
                color: 'var(--btn-text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: added ? 14 : 20, fontWeight: 700,
                transition: 'background 0.2s, transform 0.1s',
                transform: adding ? 'scale(0.9)' : 'scale(1)',
                lineHeight: 1,
              }}
              aria-label={tr('В корзину', 'Savatga')}
            >
              {added ? '✓' : adding ? '·' : '+'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function BottomNav({ active }: { active: string }) {
  const { tr } = useMiniI18n();
  const [cartCount, setCartCount] = useState(cartStore.get());

  useEffect(() => {
    setCartCount(cartStore.get());
    return cartStore.sub(setCartCount);
  }, []);

  const tabs = [
    {
      id: 'catalog', path: '/', label: tr('Каталог', 'Katalog'),
      icon: (
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
      ),
    },
    {
      id: 'cart', path: '/cart', label: tr('Корзина', 'Savat'),
      icon: (
        <svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      ),
    },
    {
      id: 'orders', path: '/orders', label: tr('Заказы', 'Buyurtmalar'),
      icon: (
        <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      ),
    },
    {
      id: 'loyalty', path: '/loyalty', label: tr('Баллы', 'Ballar'),
      icon: (
        <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      ),
    },
  ];

  return (
    <nav className="bottom-nav glass">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => navigate(t.path)} className={`nav-btn${active === t.id ? ' active' : ''}`} style={{ position: 'relative' }}>
          {t.icon}
          {t.id === 'cart' && cartCount > 0 && (
            <span className="nav-badge">{cartCount > 99 ? '99+' : cartCount}</span>
          )}
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
