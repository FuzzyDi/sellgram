import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';
const steps = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
export default function OrderStatus({ id }) {
    const { tr, locale } = useMiniI18n();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const SC = useMemo(() => ({
        NEW: { emoji: '🆕', label: tr('Новый', 'Yangi'), color: 'var(--accent)' },
        CONFIRMED: { emoji: '✅', label: tr('Подтверждён', 'Tasdiqlandi'), color: '#34c759' },
        PREPARING: { emoji: '👨‍🍳', label: tr('Готовится', 'Tayyorlanmoqda'), color: '#ff9500' },
        READY: { emoji: '📦', label: tr('Готов', 'Tayyor'), color: '#af52de' },
        SHIPPED: { emoji: '🚚', label: tr('В пути', "Yo'lda"), color: '#5856d6' },
        DELIVERED: { emoji: '📬', label: tr('Доставлен', 'Yetkazildi'), color: '#30b0c7' },
        COMPLETED: { emoji: '🎉', label: tr('Завершён', 'Yakunlandi'), color: '#34c759' },
        CANCELLED: { emoji: '❌', label: tr('Отменён', 'Bekor qilindi'), color: '#ff3b30' },
        REFUNDED: { emoji: '↩️', label: tr('Возврат', 'Qaytarildi'), color: '#8e8e93' },
    }), [tr]);
    useEffect(() => {
        if (id)
            api.getOrder(id).then(setOrder).catch(() => { }).finally(() => setLoading(false));
    }, [id]);
    if (loading) {
        return (_jsxs("div", { style: { padding: 16 }, children: [_jsx("div", { className: "skeleton", style: { height: 200, borderRadius: 20, marginBottom: 16 } }), _jsx("div", { className: "skeleton", style: { height: 120, borderRadius: 'var(--radius)' } })] }));
    }
    if (!order) {
        return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--hint)' }, children: [_jsx("span", { style: { fontSize: 48 }, children: "\uD83D\uDE15" }), _jsx("p", { style: { fontWeight: 600, marginTop: 8 }, children: tr('Заказ не найден', 'Buyurtma topilmadi') })] }));
    }
    const statusKey = String(order.status);
    const s = SC[statusKey] || SC.NEW;
    const stepIdx = steps.indexOf(order.status);
    const cancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';
    return (_jsxs("div", { className: "anim-fade", style: { padding: '0 0 24px' }, children: [_jsx("div", { style: { padding: 16 }, children: _jsxs("button", { onClick: () => navigate('/orders'), style: { background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 15, padding: 0, cursor: 'pointer' }, children: ["\u2190 ", tr('Заказы', 'Buyurtmalar')] }) }), _jsxs("div", { className: "anim-scale", style: { margin: '0 12px 16px', padding: '28px 20px', borderRadius: 20, textAlign: 'center', background: `linear-gradient(145deg, ${s.color}12, ${s.color}08)`, border: `1px solid ${s.color}15` }, children: [_jsx("div", { style: { fontSize: 52, marginBottom: 4 }, children: s.emoji }), _jsxs("h2", { style: { fontSize: 22, fontWeight: 800 }, children: [tr('Заказ', 'Buyurtma'), " #", order.orderNumber] }), _jsx("p", { style: { color: s.color, fontWeight: 700, fontSize: 15, marginTop: 4 }, children: s.label }), _jsx("p", { style: { color: 'var(--hint)', fontSize: 13, marginTop: 6 }, children: new Date(order.createdAt).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })] }), !cancelled && (_jsx("div", { style: { padding: '0 20px 16px', display: 'flex', alignItems: 'center' }, children: steps.map((step, i) => {
                    const done = i <= stepIdx;
                    return (_jsxs(React.Fragment, { children: [_jsx("div", { style: { width: done ? 10 : 8, height: done ? 10 : 8, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--accent)' : 'rgba(0,0,0,0.08)', boxShadow: done ? '0 0 0 3px rgba(0,122,255,0.15)' : 'none', transition: 'all 0.3s' } }), i < steps.length - 1 && _jsx("div", { style: { flex: 1, height: 2, background: i < stepIdx ? 'var(--accent)' : 'rgba(0,0,0,0.06)', transition: 'all 0.3s' } })] }, step));
                }) })), _jsxs("div", { style: { padding: '0 12px' }, children: [_jsxs("div", { style: { background: 'var(--sec)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 12 }, children: [order.items?.map((item, i) => (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < order.items.length - 1 ? '1px solid var(--divider)' : 'none' }, children: [_jsxs("div", { children: [_jsx("p", { style: { fontWeight: 500, fontSize: 14 }, children: item.name }), _jsxs("p", { style: { color: 'var(--hint)', fontSize: 12, marginTop: 1 }, children: [item.qty, " x ", Number(item.price).toLocaleString()] })] }), _jsx("span", { style: { fontWeight: 700, fontSize: 14 }, children: Number(item.total).toLocaleString() })] }, i))), _jsxs("div", { style: { borderTop: '1px solid var(--divider)', marginTop: 4, paddingTop: 10 }, children: [Number(order.deliveryPrice) > 0 && _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--hint)', marginBottom: 4 }, children: [_jsx("span", { children: tr('Доставка', 'Yetkazish') }), _jsxs("span", { children: [Number(order.deliveryPrice).toLocaleString(), " ", tr('сум', "so'm")] })] }), Number(order.loyaltyDiscount) > 0 && _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--success)', marginBottom: 4 }, children: [_jsx("span", { children: tr('Скидка баллами', 'Ballar chegirmasi') }), _jsxs("span", { children: ["\u2212", Number(order.loyaltyDiscount).toLocaleString(), " ", tr('сум', "so'm")] })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }, children: [_jsx("span", { children: tr('Итого', 'Jami') }), _jsxs("span", { children: [Number(order.total).toLocaleString(), " ", tr('сум', "so'm")] })] })] })] }), order.deliveryAddress && (_jsxs("div", { style: { background: 'var(--sec)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 12 }, children: [_jsx("p", { style: { fontSize: 12, fontWeight: 600, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }, children: tr('Доставка', 'Yetkazish') }), _jsxs("p", { style: { fontSize: 14 }, children: ["\uD83D\uDCCD ", order.deliveryAddress] })] })), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 4 }, children: [_jsx("button", { onClick: () => navigate('/'), className: "pressable", style: { flex: 1, padding: 14, borderRadius: 'var(--radius)', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', background: 'var(--btn)', color: 'var(--btn-text)' }, children: tr('В каталог', 'Katalogga') }), _jsx("button", { onClick: () => navigate('/orders'), className: "pressable", style: { flex: 1, padding: 14, borderRadius: 'var(--radius)', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', background: 'var(--sec)', color: 'var(--text)' }, children: tr('Все заказы', 'Barcha buyurtmalar') })] })] })] }));
}
