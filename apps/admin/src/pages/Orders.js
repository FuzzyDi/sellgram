import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';
const statusColors = {
    NEW: 'bg-blue-100 text-blue-700', CONFIRMED: 'bg-green-100 text-green-700',
    PREPARING: 'bg-yellow-100 text-yellow-700', READY: 'bg-indigo-100 text-indigo-700',
    SHIPPED: 'bg-purple-100 text-purple-700', DELIVERED: 'bg-teal-100 text-teal-700',
    COMPLETED: 'bg-green-200 text-green-800', CANCELLED: 'bg-red-100 text-red-700',
    REFUNDED: 'bg-gray-100 text-gray-700',
};
const statusLabels = {
    NEW: 'Новый', CONFIRMED: 'Подтверждён', PREPARING: 'Собирается', READY: 'Готов',
    SHIPPED: 'Отправлен', DELIVERED: 'Доставлен', COMPLETED: 'Завершён',
    CANCELLED: 'Отменён', REFUNDED: 'Возврат',
};
export default function Orders() {
    const [data, setData] = useState(null);
    const [filter, setFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const loadOrders = useCallback(() => {
        setLoading(true);
        adminApi.getOrders(filter ? `status=${filter}` : '').then(setData).finally(() => setLoading(false));
    }, [filter]);
    useEffect(() => { loadOrders(); }, [filter]);
    const handleStatusChange = useCallback(async (orderId, newStatus) => {
        try {
            await adminApi.updateOrderStatus(orderId, { status: newStatus });
            loadOrders();
        }
        catch (err) {
            alert(err.message);
        }
    }, [loadOrders]);
    return (_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold mb-6", children: "\uD83D\uDCE6 \u0417\u0430\u043A\u0430\u0437\u044B" }), _jsx("div", { style: { display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }, children: ['', 'NEW', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED'].map(s => (_jsx(Button, { onClick: () => setFilter(s), className: `px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filter === s ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600'}`, children: s ? statusLabels[s] : 'Все' }, s))) }), loading ? _jsx("p", { className: "text-gray-400", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }) : (_jsxs("div", { className: "space-y-3", children: [data?.items?.map((order) => (_jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-4", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }, children: [_jsxs("div", { children: [_jsxs("p", { className: "font-bold", children: ["\u0417\u0430\u043A\u0430\u0437 #", order.orderNumber] }), _jsxs("p", { className: "text-sm text-gray-500", children: [order.customer?.firstName, " ", order.customer?.lastName, order.customer?.telegramUser && ` (@${order.customer.telegramUser})`] })] }), _jsx("span", { className: `px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`, children: statusLabels[order.status] })] }), _jsx("div", { className: "text-sm text-gray-600 mb-2", children: order.items?.map((i) => `${i.name} ×${i.qty}`).join(', ') }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("p", { className: "font-bold text-blue-600", children: [Number(order.total).toLocaleString(), " UZS"] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [order.status === 'NEW' && (_jsxs(_Fragment, { children: [_jsx(Button, { onClick: () => handleStatusChange(order.id, 'CONFIRMED'), className: "px-3 py-1 bg-green-500 text-white text-xs rounded-lg", children: "\u2705 \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C" }), _jsx(Button, { onClick: () => handleStatusChange(order.id, 'CANCELLED'), className: "px-3 py-1 bg-red-500 text-white text-xs rounded-lg", children: "\u274C \u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C" })] })), order.status === 'CONFIRMED' && (_jsx(Button, { onClick: () => handleStatusChange(order.id, 'PREPARING'), className: "px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg", children: "\uD83D\uDCE6 \u0421\u043E\u0431\u0438\u0440\u0430\u0442\u044C" })), order.status === 'PREPARING' && (_jsx(Button, { onClick: () => handleStatusChange(order.id, 'READY'), className: "px-3 py-1 bg-indigo-500 text-white text-xs rounded-lg", children: "\u2705 \u0413\u043E\u0442\u043E\u0432" })), order.status === 'READY' && (_jsx(Button, { onClick: () => handleStatusChange(order.id, 'SHIPPED'), className: "px-3 py-1 bg-purple-500 text-white text-xs rounded-lg", children: "\uD83D\uDE9A \u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C" })), order.status === 'SHIPPED' && (_jsx(Button, { onClick: () => handleStatusChange(order.id, 'DELIVERED'), className: "px-3 py-1 bg-teal-500 text-white text-xs rounded-lg", children: "\uD83D\uDCEC \u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D" })), order.status === 'DELIVERED' && (_jsx(Button, { onClick: () => handleStatusChange(order.id, 'COMPLETED'), className: "px-3 py-1 bg-green-600 text-white text-xs rounded-lg", children: "\uD83C\uDF89 \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C" }))] })] }), _jsx("p", { className: "text-xs text-gray-400 mt-2", children: new Date(order.createdAt).toLocaleString('ru-RU') })] }, order.id))), data?.items?.length === 0 && _jsx("p", { className: "text-center text-gray-400 py-8", children: "\u0417\u0430\u043A\u0430\u0437\u043E\u0432 \u043D\u0435\u0442" })] }))] }));
}
