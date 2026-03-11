import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';
const PROVIDERS = ['CASH', 'MANUAL_TRANSFER', 'CLICK', 'PAYME', 'UZUM', 'STRIPE', 'CUSTOM'];
export default function PaymentMethods() {
    const [stores, setStores] = useState([]);
    const [storeId, setStoreId] = useState('');
    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        provider: 'CUSTOM',
        code: '',
        title: '',
        description: '',
        instructions: '',
        isDefault: false,
        isActive: true,
        sortOrder: 0,
    });
    async function loadStores() {
        const list = await adminApi.getStores();
        const normalized = Array.isArray(list) ? list : [];
        setStores(normalized);
        if (!storeId && normalized[0]?.id)
            setStoreId(normalized[0].id);
    }
    async function loadMethods(targetStoreId) {
        if (!targetStoreId)
            return;
        const list = await adminApi.getStorePaymentMethods(targetStoreId);
        setMethods(Array.isArray(list) ? list : []);
    }
    async function bootstrap() {
        setLoading(true);
        try {
            await loadStores();
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
            loadMethods(storeId);
    }, [storeId]);
    const canSave = useMemo(() => form.code.trim() && form.title.trim(), [form]);
    function openCreate() {
        setEditing(null);
        setForm({
            provider: 'CUSTOM',
            code: '',
            title: '',
            description: '',
            instructions: '',
            isDefault: false,
            isActive: true,
            sortOrder: methods.length,
        });
        setFormOpen(true);
    }
    function openEdit(method) {
        setEditing(method);
        setForm({
            provider: method.provider || 'CUSTOM',
            code: method.code || '',
            title: method.title || '',
            description: method.description || '',
            instructions: method.instructions || '',
            isDefault: !!method.isDefault,
            isActive: method.isActive !== false,
            sortOrder: method.sortOrder || 0,
        });
        setFormOpen(true);
    }
    async function save() {
        if (!canSave || !storeId)
            return;
        setSaving(true);
        try {
            if (editing) {
                await adminApi.updateStorePaymentMethod(storeId, editing.id, form);
            }
            else {
                await adminApi.createStorePaymentMethod(storeId, form);
            }
            setFormOpen(false);
            await loadMethods(storeId);
        }
        catch (err) {
            alert(err.message);
        }
        finally {
            setSaving(false);
        }
    }
    async function archiveMethod(methodId) {
        if (!confirm('Archive this payment method?'))
            return;
        try {
            await adminApi.deleteStorePaymentMethod(storeId, methodId);
            await loadMethods(storeId);
        }
        catch (err) {
            alert(err.message);
        }
    }
    if (loading)
        return _jsx("p", { className: "text-gray-400", children: "Loading payment methods..." });
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }, children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold", children: "Payment Methods" }), _jsx("p", { className: "text-sm text-gray-500", children: "Store owners can configure multiple payment options for checkout." })] }), _jsx(Button, { onClick: openCreate, className: "bg-blue-600 text-white px-4 py-2 rounded-lg text-sm", children: "+ Add Method" })] }), _jsxs("div", { className: "bg-white border rounded-xl p-4 mb-4", children: [_jsx("label", { className: "text-sm text-gray-500", children: "Store" }), _jsx("select", { value: storeId, onChange: (e) => setStoreId(e.target.value), className: "w-full mt-1 border rounded-lg px-3 py-2 text-sm", children: stores.map((store) => (_jsx("option", { value: store.id, children: store.name }, store.id))) })] }), _jsx("div", { className: "bg-white border rounded-xl overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-50 text-gray-500 text-left", children: [_jsx("th", { className: "px-4 py-3", children: "Name" }), _jsx("th", { className: "px-4 py-3", children: "Provider" }), _jsx("th", { className: "px-4 py-3", children: "Code" }), _jsx("th", { className: "px-4 py-3", children: "Flags" }), _jsx("th", { className: "px-4 py-3", children: "Actions" })] }) }), _jsxs("tbody", { children: [methods.map((method) => (_jsxs("tr", { className: "border-t", children: [_jsxs("td", { className: "px-4 py-3", children: [_jsx("p", { className: "font-medium", children: method.title }), method.description && _jsx("p", { className: "text-xs text-gray-500", children: method.description })] }), _jsx("td", { className: "px-4 py-3", children: method.provider }), _jsx("td", { className: "px-4 py-3", children: method.code }), _jsxs("td", { className: "px-4 py-3", children: [_jsx("span", { className: "text-xs px-2 py-1 rounded bg-gray-100 mr-1", children: method.isActive ? 'active' : 'inactive' }), method.isDefault && _jsx("span", { className: "text-xs px-2 py-1 rounded bg-green-100 text-green-700", children: "default" })] }), _jsx("td", { className: "px-4 py-3", children: _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx(Button, { onClick: () => openEdit(method), className: "px-2 py-1 rounded bg-blue-50 text-blue-700", children: "Edit" }), _jsx(Button, { onClick: () => archiveMethod(method.id), className: "px-2 py-1 rounded bg-red-50 text-red-700", children: "Archive" })] }) })] }, method.id))), methods.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "px-4 py-8 text-center text-gray-400", children: "No payment methods configured." }) }))] })] }) }), formOpen && (_jsx("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white rounded-2xl max-w-lg w-full p-6", children: [_jsx("h3", { className: "font-bold mb-4", children: editing ? 'Edit Payment Method' : 'Create Payment Method' }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs text-gray-500", children: "Provider" }), _jsx("select", { value: form.provider, onChange: (e) => setForm((prev) => ({ ...prev, provider: e.target.value })), className: "w-full border rounded-lg px-3 py-2 text-sm", children: PROVIDERS.map((provider) => _jsx("option", { value: provider, children: provider }, provider)) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs text-gray-500", children: "Code" }), _jsx("input", { value: form.code, onChange: (e) => setForm((prev) => ({ ...prev, code: e.target.value })), className: "w-full border rounded-lg px-3 py-2 text-sm" })] })] }), _jsxs("div", { className: "mt-3", children: [_jsx("label", { className: "text-xs text-gray-500", children: "Title" }), _jsx("input", { value: form.title, onChange: (e) => setForm((prev) => ({ ...prev, title: e.target.value })), className: "w-full border rounded-lg px-3 py-2 text-sm" })] }), _jsxs("div", { className: "mt-3", children: [_jsx("label", { className: "text-xs text-gray-500", children: "Description" }), _jsx("input", { value: form.description, onChange: (e) => setForm((prev) => ({ ...prev, description: e.target.value })), className: "w-full border rounded-lg px-3 py-2 text-sm" })] }), _jsxs("div", { className: "mt-3", children: [_jsx("label", { className: "text-xs text-gray-500", children: "Instructions" }), _jsx("textarea", { value: form.instructions, onChange: (e) => setForm((prev) => ({ ...prev, instructions: e.target.value })), className: "w-full border rounded-lg px-3 py-2 text-sm", rows: 3 })] }), _jsxs("div", { className: "mt-3 grid grid-cols-2 gap-3", children: [_jsxs("label", { className: "text-sm flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: form.isDefault, onChange: (e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked })) }), "Default"] }), _jsxs("label", { className: "text-sm flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: form.isActive, onChange: (e) => setForm((prev) => ({ ...prev, isActive: e.target.checked })) }), "Active"] })] }), _jsxs("div", { className: "mt-5 flex gap-2", children: [_jsx("button", { onClick: save, disabled: !canSave || saving, className: "flex-1 bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50", children: saving ? 'Saving...' : 'Save' }), _jsx(Button, { onClick: () => setFormOpen(false), className: "px-5 py-2 bg-gray-100 rounded-lg", children: "Cancel" })] })] }) }))] }));
}
