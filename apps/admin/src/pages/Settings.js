import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';
export default function Settings() {
    const [tab, setTab] = useState('stores');
    const [stores, setStores] = useState([]);
    const [zones, setZones] = useState([]);
    const [loyalty, setLoyalty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [telegramLinkData, setTelegramLinkData] = useState(null);
    const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
    const [showStoreForm, setShowStoreForm] = useState(false);
    const [editingStoreId, setEditingStoreId] = useState(null);
    const [storeForm, setStoreForm] = useState({ name: '', botToken: '', welcomeMessage: '' });
    const [showZoneForm, setShowZoneForm] = useState(false);
    const [editingZoneId, setEditingZoneId] = useState(null);
    const [zoneForm, setZoneForm] = useState({ name: '', price: '', freeFrom: '', storeId: '' });
    async function load() {
        setLoading(true);
        try {
            const [s, z, l] = await Promise.all([
                adminApi.getStores(),
                adminApi.getDeliveryZones(),
                adminApi.getLoyaltyConfig(),
            ]);
            setStores(Array.isArray(s) ? s : []);
            setZones(Array.isArray(z) ? z : []);
            setLoyalty(l);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        load();
    }, []);
    async function generateTelegramLinkCode() {
        setTelegramLinkLoading(true);
        try {
            const data = await adminApi.createTelegramLinkCode();
            setTelegramLinkData(data);
        }
        catch (err) {
            alert(err.message);
        }
        finally {
            setTelegramLinkLoading(false);
        }
    }
    function openCreateStore() {
        setEditingStoreId(null);
        setStoreForm({ name: '', botToken: '', welcomeMessage: '' });
        setShowStoreForm(true);
    }
    function openEditStore(store) {
        setEditingStoreId(store.id);
        setStoreForm({ name: store.name || '', botToken: '', welcomeMessage: store.welcomeMessage || '' });
        setShowStoreForm(true);
    }
    async function saveStore() {
        try {
            if (editingStoreId) {
                const data = { name: storeForm.name, welcomeMessage: storeForm.welcomeMessage };
                if (storeForm.botToken)
                    data.botToken = storeForm.botToken;
                await adminApi.updateStore(editingStoreId, data);
            }
            else {
                if (!storeForm.name || !storeForm.botToken) {
                    alert('Store name and bot token are required');
                    return;
                }
                await adminApi.createStore(storeForm);
            }
            setShowStoreForm(false);
            await load();
        }
        catch (err) {
            alert(err.message);
        }
    }
    function openCreateZone() {
        setEditingZoneId(null);
        setZoneForm({ name: '', price: '', freeFrom: '', storeId: stores[0]?.id || '' });
        setShowZoneForm(true);
    }
    function openEditZone(zone) {
        setEditingZoneId(zone.id);
        setZoneForm({
            name: zone.name || '',
            price: String(zone.price || ''),
            freeFrom: zone.freeFrom ? String(zone.freeFrom) : '',
            storeId: zone.storeId || '',
        });
        setShowZoneForm(true);
    }
    async function saveZone() {
        try {
            const data = {
                name: zoneForm.name,
                price: Number(zoneForm.price),
                freeFrom: zoneForm.freeFrom ? Number(zoneForm.freeFrom) : null,
            };
            if (editingZoneId) {
                await adminApi.updateDeliveryZone(editingZoneId, data);
            }
            else {
                await adminApi.createDeliveryZone({ ...data, storeId: zoneForm.storeId || stores[0]?.id });
            }
            setShowZoneForm(false);
            await load();
        }
        catch (err) {
            alert(err.message);
        }
    }
    async function deleteZone(id) {
        if (!confirm('Delete this zone?'))
            return;
        try {
            await adminApi.deleteDeliveryZone(id);
            await load();
        }
        catch (err) {
            alert(err.message);
        }
    }
    async function saveLoyalty() {
        try {
            await adminApi.updateLoyaltyConfig(loyalty);
            alert('Saved');
        }
        catch (err) {
            alert(err.message);
        }
    }
    if (loading)
        return _jsx("p", { className: "text-gray-400", children: "Loading settings..." });
    return (_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold mb-6", children: "Settings" }), _jsxs("div", { className: "bg-white rounded-xl border p-4 mb-6", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: "Telegram Admin Linking" }), _jsx("p", { className: "text-sm text-gray-500", children: "Generate a one-time code and send `/admin CODE` to your bot." })] }), _jsx(Button, { onClick: generateTelegramLinkCode, className: "bg-blue-600 text-white px-3 py-2 rounded-lg text-sm", children: telegramLinkLoading ? 'Generating...' : 'Generate Code' })] }), telegramLinkData && (_jsxs("div", { className: "mt-3 p-3 rounded-lg bg-slate-50 border", children: [_jsxs("p", { className: "text-sm", children: ["Code: ", _jsx("span", { className: "font-mono font-bold", children: telegramLinkData.code })] }), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: ["Expires: ", new Date(telegramLinkData.expiresAt).toLocaleString()] }), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: ["Command: ", _jsx("span", { className: "font-mono", children: telegramLinkData.command })] })] }))] }), _jsx("div", { style: { display: 'flex', gap: 4, marginBottom: 20, background: '#f3f4f6', borderRadius: 8, padding: 4, width: 'fit-content' }, children: [
                    { key: 'stores', label: 'Stores' },
                    { key: 'zones', label: 'Delivery' },
                    { key: 'loyalty', label: 'Loyalty' },
                ].map((t) => (_jsx(Button, { onClick: () => setTab(t.key), className: `px-4 py-2 rounded-md text-sm ${tab === t.key ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500'}`, children: t.label }, t.key))) }), tab === 'stores' && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 12 }, children: [_jsx("p", { className: "text-sm text-gray-500", children: "Each store represents one Telegram bot." }), _jsx(Button, { onClick: openCreateStore, className: "bg-blue-600 text-white px-4 py-2 rounded-lg text-sm", children: "+ Store" })] }), stores.map((store) => (_jsx("div", { className: "bg-white rounded-xl border p-4 mb-3", children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { children: [_jsx("p", { className: "font-bold", children: store.name }), store.botUsername && _jsxs("p", { className: "text-sm text-blue-500", children: ["@", store.botUsername] })] }), _jsx(Button, { onClick: () => openEditStore(store), className: "px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100", children: "Edit" })] }) }, store.id)))] })), tab === 'zones' && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 12 }, children: [_jsx("p", { className: "text-sm text-gray-500", children: "Delivery zones and tariffs." }), _jsx(Button, { onClick: openCreateZone, className: "bg-blue-600 text-white px-4 py-2 rounded-lg text-sm", children: "+ Zone" })] }), _jsx("div", { className: "bg-white rounded-xl border overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-gray-500 border-b bg-gray-50", children: [_jsx("th", { className: "px-4 py-3", children: "Zone" }), _jsx("th", { className: "px-4 py-3", children: "Price" }), _jsx("th", { className: "px-4 py-3", children: "Free From" }), _jsx("th", { className: "px-4 py-3", children: "Actions" })] }) }), _jsx("tbody", { children: zones.map((zone) => (_jsxs("tr", { className: "border-b hover:bg-gray-50", children: [_jsx("td", { className: "px-4 py-3 font-medium", children: zone.name }), _jsxs("td", { className: "px-4 py-3", children: [Number(zone.price).toLocaleString(), " UZS"] }), _jsx("td", { className: "px-4 py-3 text-gray-500", children: zone.freeFrom ? Number(zone.freeFrom).toLocaleString() + ' UZS' : '-' }), _jsx("td", { className: "px-4 py-3", children: _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx(Button, { onClick: () => openEditZone(zone), className: "px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded", children: "Edit" }), _jsx(Button, { onClick: () => deleteZone(zone.id), className: "px-2 py-1 text-xs bg-red-50 text-red-600 rounded", children: "Delete" })] }) })] }, zone.id))) })] }) })] })), tab === 'loyalty' && loyalty && (_jsxs("div", { className: "bg-white rounded-xl border p-6 max-w-lg", children: [_jsx("h3", { className: "font-bold mb-4", children: "Loyalty Program" }), _jsx("form", { onSubmit: (e) => { e.preventDefault(); saveLoyalty(); }, children: _jsxs("div", { className: "space-y-4", children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 8 }, className: "text-sm", children: [_jsx("input", { type: "checkbox", checked: !!loyalty.isEnabled, onChange: (e) => setLoyalty({ ...loyalty, isEnabled: e.target.checked }) }), " Enabled"] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-500 mb-1", children: "Unit Amount" }), _jsx("input", { type: "number", value: loyalty.unitAmount || 1000, onChange: (e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-500 mb-1", children: "Points Per Unit" }), _jsx("input", { type: "number", value: loyalty.pointsPerUnit || 1, onChange: (e) => setLoyalty({ ...loyalty, pointsPerUnit: +e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-500 mb-1", children: "Point Value" }), _jsx("input", { type: "number", value: loyalty.pointValue || 100, onChange: (e) => setLoyalty({ ...loyalty, pointValue: +e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-500 mb-1", children: "Max Discount %" }), _jsx("input", { type: "number", value: loyalty.maxDiscountPct || 30, onChange: (e) => setLoyalty({ ...loyalty, maxDiscountPct: +e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm" })] })] }), _jsx("button", { type: "submit", className: "w-full bg-blue-600 text-white py-2 rounded-lg", children: "Save" })] }) })] })), showStoreForm && (_jsx("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white rounded-2xl max-w-md w-full p-6", children: [_jsx("h3", { className: "font-bold mb-4", children: editingStoreId ? 'Edit Store' : 'New Store' }), _jsx("input", { value: storeForm.name, onChange: (e) => setStoreForm({ ...storeForm, name: e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm mb-2", placeholder: "Store name" }), _jsx("input", { value: storeForm.botToken, onChange: (e) => setStoreForm({ ...storeForm, botToken: e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm mb-2", placeholder: "Bot token" }), _jsx("textarea", { value: storeForm.welcomeMessage, onChange: (e) => setStoreForm({ ...storeForm, welcomeMessage: e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm", rows: 2, placeholder: "Welcome message" }), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 12 }, children: [_jsx("button", { onClick: saveStore, className: "flex-1 bg-blue-600 text-white py-2 rounded-lg", children: "Save" }), _jsx(Button, { onClick: () => setShowStoreForm(false), className: "px-4 py-2 bg-gray-100 rounded-lg", children: "Cancel" })] })] }) })), showZoneForm && (_jsx("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white rounded-2xl max-w-md w-full p-6", children: [_jsx("h3", { className: "font-bold mb-4", children: editingZoneId ? 'Edit Zone' : 'New Zone' }), !editingZoneId && (_jsx("select", { value: zoneForm.storeId, onChange: (e) => setZoneForm({ ...zoneForm, storeId: e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm mb-2", children: stores.map((store) => _jsx("option", { value: store.id, children: store.name }, store.id)) })), _jsx("input", { value: zoneForm.name, onChange: (e) => setZoneForm({ ...zoneForm, name: e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm mb-2", placeholder: "Zone name" }), _jsx("input", { type: "number", value: zoneForm.price, onChange: (e) => setZoneForm({ ...zoneForm, price: e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm mb-2", placeholder: "Price" }), _jsx("input", { type: "number", value: zoneForm.freeFrom, onChange: (e) => setZoneForm({ ...zoneForm, freeFrom: e.target.value }), className: "w-full px-3 py-2 border rounded-lg text-sm", placeholder: "Free from" }), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 12 }, children: [_jsx("button", { onClick: saveZone, className: "flex-1 bg-blue-600 text-white py-2 rounded-lg", children: "Save" }), _jsx(Button, { onClick: () => setShowZoneForm(false), className: "px-4 py-2 bg-gray-100 rounded-lg", children: "Cancel" })] })] }) }))] }));
}
