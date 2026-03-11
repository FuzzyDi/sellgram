import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';
export default function Broadcasts() {
    const [stores, setStores] = useState([]);
    const [storeId, setStoreId] = useState('');
    const [customers, setCustomers] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
    const [targetType, setTargetType] = useState('ALL');
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    async function loadStores() {
        const list = await adminApi.getStores();
        const normalized = Array.isArray(list) ? list : [];
        setStores(normalized);
        if (!storeId && normalized[0]?.id)
            setStoreId(normalized[0].id);
    }
    async function loadCustomers() {
        const result = await adminApi.getCustomers('page=1&pageSize=200');
        const items = Array.isArray(result?.items) ? result.items : [];
        setCustomers(items);
    }
    async function loadCampaigns(targetStoreId) {
        const list = await adminApi.getBroadcasts(targetStoreId);
        setCampaigns(Array.isArray(list) ? list : []);
    }
    async function bootstrap() {
        setLoading(true);
        try {
            await Promise.all([loadStores(), loadCustomers()]);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        bootstrap();
    }, []);
    useEffect(() => {
        if (storeId)
            loadCampaigns(storeId);
    }, [storeId]);
    const filteredCustomers = useMemo(() => customers.filter((customer) => customer?.telegramId), [customers]);
    const canSend = !!storeId &&
        message.trim().length > 0 &&
        (targetType === 'ALL' || selectedCustomerIds.length > 0);
    async function sendCampaign() {
        if (!canSend)
            return;
        setSending(true);
        try {
            await adminApi.sendBroadcast({
                storeId,
                title: title.trim() || undefined,
                message: message.trim(),
                targetType,
                customerIds: targetType === 'SELECTED' ? selectedCustomerIds : undefined,
            });
            setTitle('');
            setMessage('');
            setSelectedCustomerIds([]);
            await loadCampaigns(storeId);
            alert('Campaign sent');
        }
        catch (err) {
            alert(err.message);
        }
        finally {
            setSending(false);
        }
    }
    function toggleCustomer(customerId) {
        setSelectedCustomerIds((prev) => prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]);
    }
    if (loading)
        return _jsx("p", { className: "text-gray-400", children: "Loading broadcasts..." });
    return (_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold mb-1", children: "Broadcasts" }), _jsx("p", { className: "text-sm text-gray-500 mb-5", children: "Send promotional messages to all or selected customers." }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "bg-white border rounded-xl p-4", children: [_jsx("h3", { className: "font-semibold mb-3", children: "New Campaign" }), _jsx("label", { className: "text-xs text-gray-500", children: "Store" }), _jsx("select", { value: storeId, onChange: (e) => setStoreId(e.target.value), className: "w-full border rounded-lg px-3 py-2 text-sm mb-3", children: stores.map((store) => (_jsx("option", { value: store.id, children: store.name }, store.id))) }), _jsx("label", { className: "text-xs text-gray-500", children: "Title (optional)" }), _jsx("input", { value: title, onChange: (e) => setTitle(e.target.value), className: "w-full border rounded-lg px-3 py-2 text-sm mb-3" }), _jsx("label", { className: "text-xs text-gray-500", children: "Message" }), _jsx("textarea", { value: message, onChange: (e) => setMessage(e.target.value), rows: 5, className: "w-full border rounded-lg px-3 py-2 text-sm mb-3" }), _jsxs("div", { className: "mb-3", children: [_jsx("label", { className: "text-xs text-gray-500 block mb-1", children: "Target Type" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx(Button, { onClick: () => setTargetType('ALL'), className: `px-3 py-1.5 rounded-lg text-sm ${targetType === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`, children: "All Customers" }), _jsx(Button, { onClick: () => setTargetType('SELECTED'), className: `px-3 py-1.5 rounded-lg text-sm ${targetType === 'SELECTED' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`, children: "Selected" })] })] }), targetType === 'SELECTED' && (_jsxs("div", { className: "border rounded-lg p-3 max-h-56 overflow-auto mb-3", children: [filteredCustomers.map((customer) => (_jsxs("label", { style: { display: 'flex', gap: 8, alignItems: 'center' }, className: "text-sm py-1", children: [_jsx("input", { type: "checkbox", checked: selectedCustomerIds.includes(customer.id), onChange: () => toggleCustomer(customer.id) }), _jsxs("span", { children: [customer.firstName || customer.telegramUser || customer.id, " ", customer.phone ? `(${customer.phone})` : ''] })] }, customer.id))), filteredCustomers.length === 0 && _jsx("p", { className: "text-sm text-gray-400", children: "No customers yet." })] })), _jsx("button", { onClick: sendCampaign, disabled: !canSend || sending, className: "w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50", children: sending ? 'Sending...' : 'Send Campaign' })] }), _jsxs("div", { className: "bg-white border rounded-xl p-4", children: [_jsx("h3", { className: "font-semibold mb-3", children: "Recent Campaigns" }), _jsxs("div", { className: "space-y-3", children: [campaigns.map((campaign) => (_jsxs("div", { className: "border rounded-lg p-3", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: 8 }, children: [_jsx("p", { className: "font-medium", children: campaign.title || 'Untitled campaign' }), _jsx("span", { className: "text-xs px-2 py-1 rounded bg-gray-100", children: campaign.status })] }), _jsx("p", { className: "text-xs text-gray-500 mt-1 line-clamp-2", children: campaign.message }), _jsxs("p", { className: "text-xs text-gray-400 mt-2", children: ["Recipients: ", campaign.totalRecipients, " | Sent: ", campaign.sentCount, " | Failed: ", campaign.failedCount] })] }, campaign.id))), campaigns.length === 0 && _jsx("p", { className: "text-sm text-gray-400", children: "No campaigns sent yet." })] })] })] })] }));
}
