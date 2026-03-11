import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { BottomNav } from './Catalog';
import { useMiniI18n } from '../i18n';
export default function Cart() {
    const { tr } = useMiniI18n();
    const [cart, setCart] = useState(null);
    const [loading, setLoading] = useState(true);
    const loadCart = () => {
        setLoading(true);
        api.getCart().then(setCart).catch(() => { }).finally(() => setLoading(false));
    };
    useEffect(loadCart, []);
    const updateQty = async (id, qty) => {
        try {
            if (qty <= 0)
                await api.removeCartItem(id);
            else
                await api.updateCartItem(id, qty);
            loadCart();
        }
        catch { }
    };
    if (loading) {
        return (_jsxs("div", { style: { padding: 16 }, children: [_jsx("div", { className: "skeleton", style: { height: 28, width: 100, marginBottom: 16 } }), [1, 2].map((i) => _jsx("div", { className: "skeleton", style: { height: 72, marginBottom: 8, borderRadius: 'var(--radius)' } }, i))] }));
    }
    const items = cart?.items || [];
    return (_jsxs("div", { className: "anim-fade", style: { paddingBottom: items.length ? 'calc(var(--nav-h) + 80px)' : 'calc(var(--nav-h) + 12px)' }, children: [_jsx("div", { className: "glass", style: { position: 'sticky', top: 0, zIndex: 20, padding: 16, borderBottom: '0.5px solid var(--divider)' }, children: _jsx("h1", { style: { fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }, children: tr('Корзина', 'Savat') }) }), items.length === 0 ? (_jsxs("div", { className: "anim-scale", style: { textAlign: 'center', padding: '72px 16px' }, children: [_jsx("div", { style: { fontSize: 56, marginBottom: 12 }, children: "\uD83D\uDED2" }), _jsx("p", { style: { fontSize: 18, fontWeight: 600, marginBottom: 4 }, children: tr('Корзина пуста', 'Savat bo‘sh') }), _jsx("p", { style: { fontSize: 14, color: 'var(--hint)', marginBottom: 20 }, children: tr('Добавьте товары из каталога', 'Katalogdan mahsulot qo‘shing') }), _jsx("button", { onClick: () => navigate('/'), className: "pressable", style: { padding: '10px 24px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }, children: tr('В каталог', 'Katalogga') })] })) : (_jsx("div", { style: { padding: '8px 12px' }, children: items.map((item, i) => (_jsxs("div", { className: `anim-fade anim-d${Math.min(i, 5)}`, style: { display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--sec)', borderRadius: 'var(--radius)', marginBottom: 8 }, children: [_jsx("div", { style: { width: 56, height: 56, borderRadius: 'var(--radius-sm)', background: 'var(--sec)', overflow: 'hidden', flexShrink: 0 }, children: item.image ? _jsx("img", { src: item.image, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : _jsx("div", { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsx("span", { children: "\uD83D\uDCE6" }) }) }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("p", { style: { fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: item.name }), _jsxs("p", { style: { fontWeight: 700, fontSize: 14, marginTop: 2 }, children: [item.price.toLocaleString(), " ", _jsx("span", { style: { fontSize: 11, fontWeight: 500, color: 'var(--hint)' }, children: tr('сум', "so'm") })] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsx("button", { onClick: () => updateQty(item.id, item.qty - 1), className: "pressable", style: { width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: "\u2212" }), _jsx("span", { style: { fontWeight: 700, fontSize: 15, minWidth: 24, textAlign: 'center' }, children: item.qty }), _jsx("button", { onClick: () => updateQty(item.id, item.qty + 1), className: "pressable", style: { width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: "+" })] })] }, item.id))) })), items.length > 0 && (_jsxs("div", { className: "glass", style: { position: 'fixed', bottom: 'var(--nav-h)', left: 0, right: 0, zIndex: 30, padding: '10px 16px 10px', borderTop: '0.5px solid var(--divider)' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsxs("span", { style: { fontSize: 15, color: 'var(--hint)' }, children: [items.length, " ", tr('товар(ов)', 'ta mahsulot')] }), _jsxs("span", { style: { fontSize: 18, fontWeight: 800 }, children: [cart.subtotal?.toLocaleString(), " ", tr('сум', "so'm")] })] }), _jsx("button", { onClick: () => navigate('/checkout'), className: "pressable", style: { width: '100%', padding: 15, borderRadius: 'var(--radius)', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'var(--btn)', color: 'var(--btn-text)' }, children: tr('Оформить заказ', 'Buyurtma berish') })] })), _jsx(BottomNav, { active: "cart" })] }));
}
