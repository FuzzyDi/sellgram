import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [topProducts, setTopProducts] = useState([]);
    const [sub, setSub] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        Promise.all([
            adminApi.getDashboard(),
            adminApi.getTopProducts(),
            adminApi.getSubscription().catch(() => null),
        ]).then(([s, tp, sub]) => {
            setStats(s);
            setTopProducts(Array.isArray(tp) ? tp : tp?.items || []);
            setSub(sub);
        }).finally(() => setLoading(false));
    }, []);
    if (loading)
        return _jsx("p", { className: "text-gray-400", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." });
    const usage = sub?.usage;
    const plan = sub?.plan || 'FREE';
    // Onboarding checklist
    const checks = [
        { done: true, label: 'Зарегистрироваться', desc: 'Вы здесь — отлично!' },
        { done: (stats?.totalProducts || 0) > 0, label: 'Добавить товары', desc: 'Товары → + Добавить', link: '#/products' },
        { done: (stats?.totalProducts || 0) > 0, label: 'Загрузить фото', desc: 'Откройте товар → 📷 Фотографии', link: '#/products' },
        { done: (usage?.stores?.current || 0) > 0, label: 'Подключить бота', desc: 'Настройки → Редактировать → Токен', link: '#/settings' },
        { done: (usage?.deliveryZones?.current || 0) > 0, label: 'Настроить доставку', desc: 'Настройки → 🚚 Доставка', link: '#/settings' },
    ];
    const completedSteps = checks.filter(c => c.done).length;
    const allDone = completedSteps === checks.length;
    return (_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold mb-6", children: "\uD83D\uDCCA \u0414\u0430\u0448\u0431\u043E\u0440\u0434" }), !allDone && (_jsxs("div", { style: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, marginBottom: 24 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, children: [_jsxs("div", { children: [_jsx("h3", { className: "font-bold text-lg", children: "\uD83D\uDE80 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u0432\u0430\u0448 \u043C\u0430\u0433\u0430\u0437\u0438\u043D" }), _jsxs("p", { className: "text-sm text-gray-500 mt-1", children: [completedSteps, " \u0438\u0437 ", checks.length, " \u0448\u0430\u0433\u043E\u0432 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E"] })] }), _jsxs("div", { style: { width: 48, height: 48, borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#00875a' }, children: [Math.round(completedSteps / checks.length * 100), "%"] })] }), _jsx("div", { style: { height: 6, background: '#f3f4f6', borderRadius: 3, marginBottom: 16 }, children: _jsx("div", { style: { height: '100%', borderRadius: 3, background: '#00875a', width: `${completedSteps / checks.length * 100}%`, transition: 'width 0.5s' } }) }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: checks.map((c, i) => (_jsxs("div", { onClick: () => c.link && (window.location.hash = c.link.replace('#', '')), style: {
                                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                                borderRadius: 10, background: c.done ? '#f0fdf4' : '#fafafa', cursor: c.link ? 'pointer' : 'default',
                            }, children: [_jsx("span", { style: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: c.done ? '#00875a' : '#e5e7eb', color: c.done ? '#fff' : '#9ca3af' }, children: c.done ? '✓' : i + 1 }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("p", { style: { fontWeight: 600, fontSize: 14, color: c.done ? '#6b7280' : '#1a1a1a', textDecoration: c.done ? 'line-through' : 'none' }, children: c.label }), !c.done && _jsx("p", { style: { fontSize: 12, color: '#9ca3af', marginTop: 1 }, children: c.desc })] }), c.link && !c.done && _jsx("span", { style: { fontSize: 14, color: '#00875a' }, children: "\u2192" })] }, i))) })] })), allDone && (_jsxs("div", { style: { background: 'linear-gradient(135deg, #00875a, #00b96b)', borderRadius: 16, padding: 24, marginBottom: 24, color: '#fff' }, children: [_jsx("h3", { className: "font-bold text-lg", children: "\uD83C\uDF89 \u041C\u0430\u0433\u0430\u0437\u0438\u043D \u0433\u043E\u0442\u043E\u0432 \u043A \u0440\u0430\u0431\u043E\u0442\u0435!" }), _jsx("p", { style: { fontSize: 14, opacity: 0.9, marginTop: 8, lineHeight: 1.7 }, children: "\u0422\u0435\u043F\u0435\u0440\u044C \u043F\u0440\u0438\u0432\u043B\u0435\u043A\u0430\u0439\u0442\u0435 \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u0435\u0439:" }), _jsxs("ul", { style: { fontSize: 14, marginTop: 12, paddingLeft: 20, lineHeight: 2 }, children: [_jsx("li", { children: "\u0420\u0430\u0437\u043C\u0435\u0441\u0442\u0438\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0431\u043E\u0442\u0430 \u0432 Instagram / Telegram-\u043A\u0430\u043D\u0430\u043B\u0435" }), _jsx("li", { children: "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 QR-\u043A\u043E\u0434 \u0441 \u0431\u043E\u0442\u043E\u043C \u043D\u0430 \u0432\u044B\u0432\u0435\u0441\u043A\u0443 / \u0432\u0438\u0437\u0438\u0442\u043A\u0438" }), _jsx("li", { children: "\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u0435 \u0441\u043A\u0438\u0434\u043A\u0443 \u043D\u0430 \u043F\u0435\u0440\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 \u0447\u0435\u0440\u0435\u0437 \u0431\u043E\u0442\u0430" }), _jsx("li", { children: "\u0420\u0430\u0441\u0441\u043A\u0430\u0437\u044B\u0432\u0430\u0439\u0442\u0435 \u043F\u0440\u043E \u0431\u043E\u043D\u0443\u0441\u043D\u044B\u0435 \u0431\u0430\u043B\u043B\u044B \u2014 \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u0438 \u0432\u0435\u0440\u043D\u0443\u0442\u0441\u044F" })] })] })), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }, children: [
                    { label: 'Заказы сегодня', value: stats?.ordersToday || 0, icon: '📦', color: '#3b82f6' },
                    { label: 'Выручка (мес)', value: `${((stats?.revenue?.month || 0) / 1000).toFixed(0)}K`, icon: '💰', color: '#00875a' },
                    { label: 'Клиентов', value: stats?.totalCustomers || 0, icon: '👥', color: '#8b5cf6' },
                    { label: 'Товаров', value: stats?.totalProducts || 0, icon: '🏷️', color: '#f59e0b' },
                ].map((s, i) => (_jsx("div", { style: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20 }, children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }, children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-500", children: s.label }), _jsx("p", { className: "text-2xl font-bold mt-1", children: s.value })] }), _jsx("span", { style: { fontSize: 28 }, children: s.icon })] }) }, i))) }), topProducts.length > 0 && (_jsxs("div", { style: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20 }, children: [_jsx("h3", { className: "font-bold mb-3", children: "\uD83C\uDFC6 \u0422\u043E\u043F \u0442\u043E\u0432\u0430\u0440\u044B" }), topProducts.slice(0, 5).map((p, i) => (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid #f3f4f6' : 'none' }, children: [_jsxs("span", { className: "text-sm", children: [i + 1, ". ", p.name] }), _jsxs("span", { className: "text-sm font-medium", children: [Number(p.totalRevenue || 0).toLocaleString(), " \u0441\u0443\u043C"] })] }, i)))] }))] }));
}
