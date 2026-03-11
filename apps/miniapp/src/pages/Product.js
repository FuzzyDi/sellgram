import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';
export default function Product({ id }) {
    const { tr } = useMiniI18n();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState(false);
    const [imgIdx, setImgIdx] = useState(0);
    const scrollRef = useRef(null);
    useEffect(() => {
        if (id) {
            api.getProduct(id).then(setProduct).catch(() => { }).finally(() => setLoading(false));
        }
    }, [id]);
    const addToCart = async () => {
        if (!product || adding)
            return;
        setAdding(true);
        try {
            await api.addToCart(product.id);
            setAdded(true);
            window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
            setTimeout(() => setAdded(false), 2000);
        }
        catch (err) {
            alert(err.message);
        }
        setAdding(false);
    };
    const onScroll = () => {
        if (!scrollRef.current)
            return;
        setImgIdx(Math.round(scrollRef.current.scrollLeft / scrollRef.current.clientWidth));
    };
    if (loading) {
        return (_jsxs("div", { children: [_jsx("div", { className: "skeleton", style: { width: '100%', aspectRatio: '1' } }), _jsxs("div", { style: { padding: 16 }, children: [_jsx("div", { className: "skeleton", style: { height: 24, width: '70%', marginBottom: 12 } }), _jsx("div", { className: "skeleton", style: { height: 32, width: '40%' } })] })] }));
    }
    if (!product) {
        return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, color: 'var(--hint)' }, children: [_jsx("span", { style: { fontSize: 48 }, children: "\uD83D\uDE15" }), _jsx("p", { style: { fontWeight: 600 }, children: tr('Товар не найден', 'Mahsulot topilmadi') }), _jsxs("button", { onClick: () => navigate('/'), style: { color: 'var(--accent)', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer' }, children: ["\u2190 ", tr('В каталог', 'Katalogga')] })] }));
    }
    const images = product.images || [];
    const inStock = product.stockQty > 0;
    return (_jsxs("div", { className: "anim-fade", style: { paddingBottom: 88 }, children: [_jsx("button", { onClick: () => navigate('/'), className: "pressable", style: { position: 'absolute', top: 12, left: 12, zIndex: 20, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', width: 36, height: 36, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: "\u2039" }), images.length > 0 ? (_jsxs("div", { style: { position: 'relative' }, children: [_jsx("div", { ref: scrollRef, onScroll: onScroll, style: { display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }, children: images.map((img, i) => (_jsx("div", { style: { flex: '0 0 100%', scrollSnapAlign: 'start', aspectRatio: '1', background: 'var(--sec)' }, children: _jsx("img", { src: img.url, alt: "", style: { width: '100%', height: '100%', objectFit: 'cover' } }) }, img.id || i))) }), images.length > 1 && (_jsx("div", { style: { position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }, children: images.map((_, i) => (_jsx("div", { style: { width: imgIdx === i ? 20 : 6, height: 6, borderRadius: 3, background: imgIdx === i ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } }, i))) }))] })) : (_jsx("div", { style: { aspectRatio: '1', background: 'var(--sec)', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsx("span", { style: { fontSize: 72, opacity: 0.15 }, children: "\uD83D\uDCE6" }) })), _jsxs("div", { style: { padding: '16px 16px 8px' }, children: [product.category && _jsx("span", { className: "anim-fade anim-d1", style: { display: 'inline-block', fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-light)', padding: '3px 10px', borderRadius: 8 }, children: product.category.name }), _jsx("h1", { className: "anim-fade anim-d2", style: { fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginTop: 10 }, children: product.name }), _jsxs("p", { className: "anim-fade anim-d3", style: { fontSize: 28, fontWeight: 800, marginTop: 12, letterSpacing: -0.5 }, children: [Number(product.price).toLocaleString(), " ", _jsx("span", { style: { fontSize: 16, fontWeight: 500, color: 'var(--hint)' }, children: tr('сум', "so'm") })] }), product.description && _jsx("p", { className: "anim-fade anim-d4", style: { color: 'var(--hint)', marginTop: 16, lineHeight: 1.55, fontSize: 15 }, children: product.description }), _jsxs("div", { className: "anim-fade anim-d5", style: { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--sec)' }, children: [_jsx("span", { style: { width: 7, height: 7, borderRadius: '50%', background: inStock ? (product.stockQty > 5 ? 'var(--success)' : 'var(--warning)') : 'var(--danger)' } }), _jsx("span", { style: { fontSize: 13, fontWeight: 500, color: 'var(--hint)' }, children: !inStock ? tr('Нет в наличии', "Mavjud emas") : product.stockQty > 5 ? tr('В наличии', 'Mavjud') : tr(`Осталось ${product.stockQty} шт`, `${product.stockQty} ta qoldi`) })] })] }), _jsx("div", { className: "glass", style: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '10px 16px max(env(safe-area-inset-bottom, 0px), 10px)', borderTop: '0.5px solid var(--divider)' }, children: _jsx("button", { onClick: addToCart, disabled: !inStock || adding, className: "pressable", style: { width: '100%', padding: 16, borderRadius: 'var(--radius)', border: 'none', fontSize: 16, fontWeight: 700, cursor: inStock ? 'pointer' : 'default', background: added ? 'var(--success)' : !inStock ? 'var(--sec)' : 'var(--btn)', color: added ? '#fff' : !inStock ? 'var(--hint)' : 'var(--btn-text)', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)' }, children: added ? tr('✓ В корзине', '✓ Savatda') : adding ? '...' : !inStock ? tr('Нет в наличии', "Mavjud emas") : `${tr('В корзину', "Savatga")} · ${Number(product.price).toLocaleString()} ${tr('сум', "so'm")}` }) })] }));
}
