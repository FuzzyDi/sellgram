import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { BottomNav } from './Catalog';
import { useMiniI18n } from '../i18n';
export default function MyOrders() {
    const { tr, locale } = useMiniI18n();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const SC = useMemo(() => ({
        NEW: { emoji: '🆕', label: tr('Новый', 'Yangi'), color: 'var(--accent)' },
        CONFIRMED: { emoji: '✅', label: tr('Подтверждён', 'Tasdiqlandi'), color: 'var(--success)' },
        PREPARING: { emoji: '👨‍🍳', label: tr('Готовится', 'Tayyorlanmoqda'), color: 'var(--warning)' },
        READY: { emoji: '📦', label: tr('Готов', 'Tayyor'), color: '#af52de' },
        SHIPPED: { emoji: '🚚', label: tr('В пути', "Yo'lda"), color: '#5856d6' },
        DELIVERED: { emoji: '📬', label: tr('Доставлен', 'Yetkazildi'), color: '#30b0c7' },
        COMPLETED: { emoji: '🎉', label: tr('Завершён', 'Yakunlandi'), color: 'var(--success)' },
        CANCELLED: { emoji: '❌', label: tr('Отменён', 'Bekor qilindi'), color: 'var(--danger)' },
        REFUNDED: { emoji: '↩️', label: tr('Возврат', 'Qaytarildi'), color: 'var(--hint)' },
    }), [tr]);
    useEffect(() => {
        api.getOrders().then(setOrders).catch(() => { }).finally(() => setLoading(false));
    }, []);
    if (loading) {
        return (_jsxs("div", { style: { padding: 16 }, children: [_jsx("div", { className: "skeleton", style: { height: 28, width: 140, marginBottom: 16 } }), [1, 2, 3].map((i) => _jsx("div", { className: "skeleton", style: { height: 80, marginBottom: 8, borderRadius: 'var(--radius)' } }, i))] }));
    }
    return (_jsxs("div", { className: "anim-fade", style: { paddingBottom: 'calc(var(--nav-h) + 12px)' }, children: [_jsx("div", { className: "glass", style: { position: 'sticky', top: 0, zIndex: 20, padding: 16, borderBottom: '0.5px solid var(--divider)' }, children: _jsx("h1", { style: { fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }, children: tr('Заказы', 'Buyurtmalar') }) }), orders.length === 0 ? (_jsxs("div", { className: "anim-scale", style: { textAlign: 'center', padding: '72px 16px' }, children: [_jsx("div", { style: { fontSize: 56, marginBottom: 12 }, children: "\uD83D\uDCE6" }), _jsx("p", { style: { fontSize: 18, fontWeight: 600 }, children: tr('Заказов пока нет', 'Hozircha buyurtmalar yo‘q') }), _jsx("p", { style: { fontSize: 14, color: 'var(--hint)', marginTop: 4 }, children: tr('Самое время сделать первый!', 'Birinchi buyurtma qilish vaqti keldi!') })] })) : (_jsx("div", { style: { padding: '8px 12px' }, children: orders.map((o, i) => {
                    const statusKey = String(o.status);
                    const s = SC[statusKey] || SC.NEW;
                    return (_jsxs("div", { onClick: () => navigate(`/order/${o.id}`), className: `pressable anim-fade anim-d${Math.min(i, 5)}`, style: { background: 'var(--sec)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 8, cursor: 'pointer' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("span", { style: { fontWeight: 700 }, children: ["#", o.orderNumber] }), _jsxs("span", { style: { fontSize: 12, fontWeight: 600, color: s.color, background: `color-mix(in srgb, ${s.color} 12%, transparent)`, padding: '3px 10px', borderRadius: 8 }, children: [s.emoji, " ", s.label] })] }), _jsx("p", { style: { color: 'var(--hint)', fontSize: 13, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: o.items?.map((it) => `${it.name} x${it.qty}`).join(', ') }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginTop: 8 }, children: [_jsxs("span", { style: { fontWeight: 700 }, children: [Number(o.total).toLocaleString(), " ", tr('сум', "so'm")] }), _jsx("span", { style: { color: 'var(--hint)', fontSize: 12 }, children: new Date(o.createdAt).toLocaleDateString(locale) })] })] }, o.id));
                }) })), _jsx(BottomNav, { active: "orders" })] }));
}
