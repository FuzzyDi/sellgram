import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';
export default function Catalog() {
    const { tr } = useMiniI18n();
    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        api.getCatalog()
            .then((d) => {
            setCategories(d.categories || []);
            setProducts(d.products || []);
        })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);
    const filtered = selected ? products.filter((p) => p.category?.id === selected) : products;
    if (loading) {
        return (_jsxs("div", { style: { padding: 16 }, children: [_jsx("div", { className: "skeleton", style: { height: 28, width: 120, marginBottom: 16 } }), _jsx("div", { style: { display: 'flex', gap: 8, marginBottom: 20 }, children: [80, 60, 70].map((w, i) => _jsx("div", { className: "skeleton", style: { height: 34, width: w, borderRadius: 17 } }, i)) }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }, children: [1, 2, 3, 4].map((i) => _jsx("div", { className: "skeleton", style: { height: 220, borderRadius: 'var(--radius)' } }, i)) })] }));
    }
    return (_jsxs("div", { style: { paddingBottom: 'calc(var(--nav-h) + 12px)' }, children: [_jsxs("div", { className: "glass", style: { position: 'sticky', top: 0, zIndex: 20, padding: '16px 16px 0', borderBottom: '0.5px solid var(--divider)' }, children: [_jsx("h1", { className: "anim-fade", style: { fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }, children: tr('Каталог', 'Katalog') }), _jsxs("div", { className: "anim-fade anim-d1", style: { display: 'flex', gap: 6, padding: '12px 0 12px', overflowX: 'auto' }, children: [_jsx(Chip, { active: !selected, onClick: () => setSelected(null), children: tr('Все', 'Barchasi') }), categories.map((c) => (_jsx(Chip, { active: selected === c.id, onClick: () => setSelected(c.id), children: c.name }, c.id)))] })] }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 12px' }, children: filtered.map((p, i) => _jsx(ProductCard, { product: p, index: i }, p.id)) }), filtered.length === 0 && (_jsxs("div", { className: "anim-scale", style: { textAlign: 'center', padding: '64px 16px' }, children: [_jsx("p", { style: { fontSize: 44, marginBottom: 8 }, children: "\uD83D\uDD0E" }), _jsx("p", { style: { fontSize: 16, fontWeight: 600, color: 'var(--hint)' }, children: tr('Товары не найдены', 'Mahsulotlar topilmadi') })] })), _jsx(BottomNav, { active: "catalog" })] }));
}
function Chip({ active, onClick, children }) {
    return (_jsx("button", { onClick: onClick, className: "pressable", style: {
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
        }, children: children }));
}
function ProductCard({ product: p, index }) {
    const { tr } = useMiniI18n();
    const delay = Math.min(index, 8);
    return (_jsxs("div", { onClick: () => navigate(`/product/${p.id}`), className: `pressable anim-fade anim-d${Math.min(delay, 5)}`, style: { background: 'var(--sec)', borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer' }, children: [_jsxs("div", { style: { aspectRatio: '1', background: 'var(--sec)', position: 'relative', overflow: 'hidden' }, children: [p.images[0]?.url ? (_jsx("img", { src: p.images[0].url, alt: p.name, style: { width: '100%', height: '100%', objectFit: 'cover' }, loading: "lazy" })) : (_jsx("div", { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsx("span", { style: { fontSize: 36, opacity: 0.25 }, children: "\uD83D\uDCE6" }) })), p.stockQty > 0 && p.stockQty <= 3 && (_jsx("span", { style: { position: 'absolute', top: 8, right: 8, padding: '3px 8px', borderRadius: 8, background: 'rgba(255,149,0,0.9)', color: '#fff', fontSize: 10, fontWeight: 700 }, children: tr('Мало', 'Kam') }))] }), _jsxs("div", { style: { padding: '10px 12px 12px' }, children: [_jsx("h3", { style: { fontWeight: 600, fontSize: 13, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }, children: p.name }), _jsxs("p", { style: { fontWeight: 700, fontSize: 16, marginTop: 6, color: 'var(--text)' }, children: [Number(p.price).toLocaleString(), " ", _jsx("span", { style: { fontSize: 12, fontWeight: 500, color: 'var(--hint)' }, children: tr('сум', "so'm") })] })] })] }));
}
export function BottomNav({ active }) {
    const { tr } = useMiniI18n();
    const tabs = [
        { id: 'catalog', path: '/', icon: '🛍️', label: tr('Каталог', 'Katalog') },
        { id: 'cart', path: '/cart', icon: '🛒', label: tr('Корзина', 'Savat') },
        { id: 'orders', path: '/orders', icon: '📦', label: tr('Заказы', 'Buyurtmalar') },
        { id: 'loyalty', path: '/loyalty', icon: '⭐', label: tr('Баллы', 'Ballar') },
    ];
    return (_jsx("nav", { className: "glass", style: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, borderTop: '0.5px solid var(--divider)', display: 'flex', justifyContent: 'space-around', padding: '5px 0 max(env(safe-area-inset-bottom, 0px), 6px)', height: 'var(--nav-h)' }, children: tabs.map((t) => (_jsxs("button", { onClick: () => navigate(t.path), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, border: 'none', background: 'none', cursor: 'pointer', padding: '2px 16px', minWidth: 56, color: active === t.id ? 'var(--accent)' : 'var(--hint)', transition: 'color 0.15s' }, children: [_jsx("span", { style: { fontSize: 22, lineHeight: 1 }, children: t.icon }), _jsx("span", { style: { fontSize: 10, fontWeight: active === t.id ? 600 : 500, letterSpacing: 0.1 }, children: t.label })] }, t.id))) }));
}
