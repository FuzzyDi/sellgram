import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';
const planColors = { FREE: '#6b7280', PRO: '#00875a', BUSINESS: '#7c3aed' };
const invoiceStatusLabels = {
    PENDING: { label: 'Ожидает оплаты', color: '#f59e0b' },
    PAID: { label: 'Оплачен', color: '#34c759' },
    CANCELLED: { label: 'Отклонён', color: '#ef4444' },
    EXPIRED: { label: 'Истёк', color: '#6b7280' },
};
export default function Billing() {
    const [sub, setSub] = useState(null);
    const [plans, setPlans] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    // Invoice flow
    const [showInvoice, setShowInvoice] = useState(null);
    const [paymentRef, setPaymentRef] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const load = useCallback(async () => {
        const [s, p, inv] = await Promise.all([
            adminApi.getSubscription().catch(() => null),
            adminApi.getPlans().catch(() => null),
            adminApi.getInvoices().catch(() => []),
        ]);
        setSub(s);
        setPlans(p);
        setInvoices(Array.isArray(inv) ? inv : []);
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, []);
    const handleUpgrade = async (plan) => {
        setSubmitting(true);
        try {
            const result = await adminApi.upgradePlan(plan);
            if (result.invoice) {
                setShowInvoice(result);
                setPaymentRef('');
            }
            else {
                load();
            }
        }
        catch (err) {
            alert(err.message);
        }
        setSubmitting(false);
    };
    const submitPayment = async () => {
        if (!paymentRef.trim() || !showInvoice?.invoice?.id)
            return;
        setSubmitting(true);
        try {
            await adminApi.submitInvoicePayment(showInvoice.invoice.id, paymentRef.trim());
            alert('✅ Данные оплаты отправлены! Ожидайте подтверждения.');
            setShowInvoice(null);
            load();
        }
        catch (err) {
            alert(err.message);
        }
        setSubmitting(false);
    };
    if (loading)
        return _jsx("p", { className: "text-gray-400", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." });
    const currentPlan = sub?.plan || 'FREE';
    const usage = sub?.usage || {};
    return (_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold mb-6", children: "\uD83D\uDCB3 \u0422\u0430\u0440\u0438\u0444\u044B \u0438 \u0431\u0438\u043B\u043B\u0438\u043D\u0433" }), _jsxs("div", { style: { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24, marginBottom: 24 }, children: [_jsx("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }, children: _jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-500", children: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0442\u0430\u0440\u0438\u0444" }), _jsx("p", { className: "text-2xl font-bold", style: { color: planColors[currentPlan] }, children: plans?.[currentPlan]?.name || currentPlan }), sub?.planExpiresAt && (_jsxs("p", { className: "text-xs text-gray-400 mt-1", children: ["\u0410\u043A\u0442\u0438\u0432\u0435\u043D \u0434\u043E: ", new Date(sub.planExpiresAt).toLocaleDateString('ru-RU')] }))] }) }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }, children: [
                            { key: 'stores', label: 'Магазины', icon: '🏪' },
                            { key: 'products', label: 'Товары', icon: '🏷️' },
                            { key: 'ordersThisMonth', label: 'Заказы (мес)', icon: '📦' },
                            { key: 'deliveryZones', label: 'Зоны', icon: '🚚' },
                        ].map(item => {
                            const u = usage[item.key];
                            if (!u)
                                return null;
                            const pct = u.limit === -1 ? 0 : Math.min(100, (u.current / u.limit) * 100);
                            return (_jsxs("div", { style: { background: '#f9fafb', borderRadius: 12, padding: 14 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsxs("span", { className: "text-sm font-medium", children: [item.icon, " ", item.label] }), _jsxs("span", { className: "text-sm text-gray-500", children: [u.current, "/", u.limit === -1 ? '∞' : u.limit] })] }), _jsx("div", { style: { height: 6, background: '#e5e7eb', borderRadius: 3 }, children: _jsx("div", { style: { height: '100%', borderRadius: 3, width: u.limit === -1 ? '5%' : `${pct}%`, background: pct >= 80 ? '#ef4444' : '#00875a', transition: 'width 0.5s' } }) })] }, item.key));
                        }) })] }), _jsx("h3", { className: "text-lg font-bold mb-4", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0430\u0440\u0438\u0444" }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }, children: plans && Object.entries(plans).map(([code, plan]) => {
                    const isCurrent = code === currentPlan;
                    const isPopular = code === 'PRO';
                    return (_jsxs("div", { style: {
                            background: '#fff', borderRadius: 16, padding: 24, position: 'relative',
                            border: isCurrent ? `2px solid ${planColors[code]}` : '1px solid #e5e7eb',
                            boxShadow: isPopular ? '0 8px 30px rgba(0,135,90,0.12)' : 'none',
                        }, children: [isPopular && _jsx("div", { style: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#00875a', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20 }, children: "\u041F\u043E\u043F\u0443\u043B\u044F\u0440\u043D\u044B\u0439" }), _jsx("p", { className: "text-sm text-gray-500", children: plan.name }), _jsx("p", { className: "text-3xl font-bold mt-1", style: { color: planColors[code] }, children: plan.price > 0 ? plan.price.toLocaleString() : 'Бесплатно' }), plan.price > 0 && _jsx("p", { className: "text-sm text-gray-500", children: "\u0441\u0443\u043C / \u043C\u0435\u0441" }), _jsx("div", { style: { margin: '16px 0' }, children: plan.features?.map((f, i) => (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }, children: [_jsx("span", { style: { color: '#00875a', fontSize: 13, fontWeight: 700 }, children: "\u2713" }), _jsx("span", { className: "text-sm text-gray-600", children: f })] }, i))) }), isCurrent ? (_jsx("div", { style: { width: '100%', padding: 10, borderRadius: 10, textAlign: 'center', background: '#f3f4f6', color: '#6b7280', fontSize: 14, fontWeight: 500 }, children: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439" })) : (_jsx(Button, { onClick: () => handleUpgrade(code), className: `w-full py-2.5 rounded-xl text-sm font-semibold text-center ${isPopular ? 'bg-green-600 text-white' : code === 'BUSINESS' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`, children: plan.price === 0 ? 'Перейти' : 'Подключить' }))] }, code));
                }) }), invoices.length > 0 && (_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-bold mb-4", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u0447\u0435\u0442\u043E\u0432" }), _jsx("div", { className: "bg-white rounded-xl border overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-gray-500 border-b bg-gray-50", children: [_jsx("th", { className: "px-4 py-3", children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { className: "px-4 py-3", children: "\u0422\u0430\u0440\u0438\u0444" }), _jsx("th", { className: "px-4 py-3", children: "\u0421\u0443\u043C\u043C\u0430" }), _jsx("th", { className: "px-4 py-3", children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { className: "px-4 py-3", children: "\u0422\u0440\u0430\u043D\u0437\u0430\u043A\u0446\u0438\u044F" })] }) }), _jsx("tbody", { children: invoices.map((inv) => {
                                        const st = invoiceStatusLabels[inv.status] || invoiceStatusLabels.PENDING;
                                        return (_jsxs("tr", { className: "border-b hover:bg-gray-50", children: [_jsx("td", { className: "px-4 py-3", children: new Date(inv.createdAt).toLocaleDateString('ru-RU') }), _jsx("td", { className: "px-4 py-3 font-medium", children: inv.plan }), _jsxs("td", { className: "px-4 py-3", children: [Number(inv.amount).toLocaleString(), " \u0441\u0443\u043C"] }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { style: { color: st.color, fontWeight: 600, fontSize: 13 }, children: st.label }) }), _jsx("td", { className: "px-4 py-3 text-gray-500", children: inv.paymentRef || '—' })] }, inv.id));
                                    }) })] }) })] })), showInvoice && (_jsx("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white rounded-2xl max-w-md w-full p-6", children: [_jsxs("h3", { className: "font-bold text-lg mb-2", children: ["\uD83D\uDCB3 \u041E\u043F\u043B\u0430\u0442\u0430 \u0442\u0430\u0440\u0438\u0444\u0430 ", showInvoice.invoice.plan] }), _jsx("p", { className: "text-sm text-gray-500 mb-4", children: "\u041F\u0435\u0440\u0435\u0432\u0435\u0434\u0438\u0442\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u0443\u044E \u0441\u0443\u043C\u043C\u0443 \u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u043E\u043C\u0435\u0440 \u0442\u0440\u0430\u043D\u0437\u0430\u043A\u0446\u0438\u0438" }), _jsx("div", { style: { background: '#f0fdf4', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }, children: _jsxs("p", { className: "text-3xl font-bold", style: { color: '#00875a' }, children: [Number(showInvoice.invoice.amount).toLocaleString(), " \u0441\u0443\u043C"] }) }), _jsxs("div", { style: { background: '#f9fafb', borderRadius: 12, padding: 14, marginBottom: 16 }, children: [_jsx("p", { className: "text-xs text-gray-500 font-semibold uppercase mb-2", children: "\u0420\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0430" }), showInvoice.bankDetails && Object.entries({
                                    'Банк': showInvoice.bankDetails.bank,
                                    'Счёт': showInvoice.bankDetails.account,
                                    'Получатель': showInvoice.bankDetails.recipient,
                                    'Назначение': `Оплата SellGram ${showInvoice.invoice.plan} — ${showInvoice.invoice.id.slice(0, 8)}`,
                                }).map(([k, v]) => (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }, children: [_jsx("span", { className: "text-sm text-gray-500", children: k }), _jsx("span", { className: "text-sm font-medium", style: { textAlign: 'right', maxWidth: '60%' }, children: v })] }, k)))] }), _jsxs("form", { onSubmit: e => { e.preventDefault(); submitPayment(); }, children: [_jsxs("div", { style: { marginBottom: 16 }, children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "\u041D\u043E\u043C\u0435\u0440 \u0442\u0440\u0430\u043D\u0437\u0430\u043A\u0446\u0438\u0438 / \u0447\u0435\u043A\u0430" }), _jsx("input", { value: paymentRef, onChange: e => setPaymentRef(e.target.value), className: "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm", placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: TXN-123456789" })] }), _jsxs("div", { style: { display: 'flex', gap: 12 }, children: [_jsx("button", { type: "submit", disabled: submitting || !paymentRef.trim(), className: "flex-1 bg-green-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50", children: submitting ? '...' : 'Отправить' }), _jsx(Button, { onClick: () => setShowInvoice(null), className: "px-6 py-2.5 bg-gray-100 rounded-lg", children: "\u041F\u043E\u0437\u0436\u0435" })] })] }), _jsx("p", { className: "text-xs text-gray-400 mt-4 text-center", children: "\u0421\u0447\u0451\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D 48 \u0447\u0430\u0441\u043E\u0432. \u041F\u043E\u0441\u043B\u0435 \u043E\u043F\u043B\u0430\u0442\u044B \u0442\u0430\u0440\u0438\u0444 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 1 \u0440\u0430\u0431\u043E\u0447\u0435\u0433\u043E \u0434\u043D\u044F." })] }) }))] }));
}
