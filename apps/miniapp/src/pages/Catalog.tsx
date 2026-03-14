import React, { useEffect, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = (isRetry = false) => {
      api.getCatalog()
        .then((d) => {
          if (cancelled) return;
          setCategories(d.categories || []);
          setProducts(d.products || []);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          if (!isRetry) {
            setTimeout(() => load(true), 700);
            return;
          }
          setLoading(false);
        });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = selected ? products.filter((p) => p.category?.id === selected) : products;

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
        <div className="anim-fade anim-d1" style={{ display: 'flex', gap: 6, padding: '12px 0 12px', overflowX: 'auto' }}>
          <Chip active={!selected} onClick={() => setSelected(null)}>{tr('Все', 'Barchasi')}</Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={selected === c.id} onClick={() => setSelected(c.id)}>{c.name}</Chip>
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="pressable" style={{
      padding: '7px 16px',
      borderRadius: 20,
      fontSize: 13,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      border: 'none',
      cursor: 'pointer',
      background: active ? 'var(--btn)' : 'var(--sec)',
      color: active ? 'var(--btn-text)' : 'var(--text)',
      transition: 'background 0.2s, color 0.2s',
    }}>{children}</button>
  );
}

function ProductCard({ product: p, index }: { product: Product; index: number }) {
  const { tr } = useMiniI18n();
  const delay = Math.min(index, 8);
  return (
    <div onClick={() => navigate(`/product/${p.id}`)} className={`pressable anim-fade anim-d${Math.min(delay, 5)}`} style={{ background: 'var(--sec)', borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ aspectRatio: '1', background: 'var(--sec)', position: 'relative', overflow: 'hidden' }}>
        {p.images[0]?.url ? (
          <img src={p.images[0].url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 36, opacity: 0.25 }}>📦</span></div>
        )}
        {p.stockQty > 0 && p.stockQty <= 3 && (
          <span style={{ position: 'absolute', top: 8, right: 8, padding: '3px 8px', borderRadius: 8, background: 'rgba(255,149,0,0.9)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
            {tr('Мало', 'Kam')}
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <h3 style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</h3>
        <p style={{ fontWeight: 700, fontSize: 16, marginTop: 6, color: 'var(--text)' }}>
          {Number(p.price).toLocaleString()} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--hint)' }}>{tr('сум', "so'm")}</span>
        </p>
      </div>
    </div>
  );
}

export function BottomNav({ active }: { active: string }) {
  const { tr } = useMiniI18n();
  const tabs = [
    { id: 'catalog', path: '/', icon: '🛍️', label: tr('Каталог', 'Katalog') },
    { id: 'cart', path: '/cart', icon: '🛒', label: tr('Корзина', 'Savat') },
    { id: 'orders', path: '/orders', icon: '📦', label: tr('Заказы', 'Buyurtmalar') },
    { id: 'loyalty', path: '/loyalty', icon: '⭐', label: tr('Баллы', 'Ballar') },
  ];

  return (
    <nav className="glass" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, borderTop: '0.5px solid var(--divider)', display: 'flex', justifyContent: 'space-around', padding: '5px 0 max(env(safe-area-inset-bottom, 0px), 6px)', height: 'var(--nav-h)' }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => navigate(t.path)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, border: 'none', background: 'none', cursor: 'pointer', padding: '2px 16px', minWidth: 56, color: active === t.id ? 'var(--accent)' : 'var(--hint)', transition: 'color 0.15s' }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</span>
          <span style={{ fontSize: 10, fontWeight: active === t.id ? 600 : 500, letterSpacing: 0.1 }}>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
