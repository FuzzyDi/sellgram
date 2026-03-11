import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';
export default function Categories() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await adminApi.getCategories();
            setCategories(Array.isArray(data) ? data : data.items || []);
        }
        catch { }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, []);
    const openCreate = () => { setEditingId(null); setName(''); setShowForm(true); };
    const openEdit = (c) => { setEditingId(c.id); setName(c.name); setShowForm(true); };
    const handleSave = async () => {
        if (!name.trim())
            return;
        setSaving(true);
        try {
            if (editingId) {
                await adminApi.updateCategory(editingId, { name: name.trim() });
            }
            else {
                await adminApi.createCategory({ name: name.trim() });
            }
            setShowForm(false);
            setName('');
            load();
        }
        catch (err) {
            alert(err.message);
        }
        setSaving(false);
    };
    const handleDelete = async (c) => {
        const count = c._count?.products || 0;
        const msg = count > 0
            ? `В категории "${c.name}" ${count} товар(ов). Товары останутся, но без категории. Удалить?`
            : `Удалить категорию "${c.name}"?`;
        if (!confirm(msg))
            return;
        try {
            await adminApi.deleteCategory(c.id);
            load();
        }
        catch (err) {
            alert(err.message);
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }, children: [_jsx("h2", { className: "text-2xl font-bold", children: "\uD83D\uDCC1 \u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438" }), _jsx(Button, { onClick: openCreate, className: "bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700", children: "+ \u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" })] }), loading ? _jsx("p", { className: "text-gray-400", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }) : (_jsx("div", { className: "bg-white rounded-xl border border-gray-200 overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-gray-500 border-b bg-gray-50", children: [_jsx("th", { className: "px-4 py-3", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), _jsx("th", { className: "px-4 py-3", children: "\u0422\u043E\u0432\u0430\u0440\u043E\u0432" }), _jsx("th", { className: "px-4 py-3 w-32", children: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" })] }) }), _jsxs("tbody", { children: [categories.map(c => (_jsxs("tr", { className: "border-b last:border-0 hover:bg-gray-50", children: [_jsxs("td", { className: "px-4 py-3", children: [_jsx("span", { className: "font-medium", children: c.name }), !c.isActive && _jsx("span", { className: "ml-2 text-xs text-red-500", children: "(\u0441\u043A\u0440\u044B\u0442\u0430)" })] }), _jsx("td", { className: "px-4 py-3 text-gray-500", children: c._count?.products || 0 }), _jsx("td", { className: "px-4 py-3", children: _jsxs("div", { style: { display: 'flex', gap: 4 }, children: [_jsx(Button, { onClick: () => openEdit(c), className: "px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100", children: "\u270F\uFE0F" }), _jsx(Button, { onClick: () => handleDelete(c), className: "px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100", children: "\uD83D\uDDD1\uFE0F" })] }) })] }, c.id))), categories.length === 0 && _jsx("tr", { children: _jsx("td", { colSpan: 3, className: "px-4 py-8 text-center text-gray-400", children: "\u041D\u0435\u0442 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439" }) })] })] }) })), showForm && (_jsx("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white rounded-2xl max-w-sm w-full p-6", children: [_jsx("h3", { className: "font-bold mb-4", children: editingId ? '✏️ Переименовать' : '📁 Новая категория' }), _jsxs("form", { onSubmit: e => { e.preventDefault(); handleSave(); }, children: [_jsx("input", { value: name, onChange: e => setName(e.target.value), autoFocus: true, className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4", placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438" }), _jsxs("div", { style: { display: 'flex', gap: 12 }, children: [_jsx("button", { type: "submit", disabled: saving, className: "flex-1 bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50", children: saving ? '...' : editingId ? 'Сохранить' : 'Создать' }), _jsx(Button, { onClick: () => setShowForm(false), className: "px-6 py-2 bg-gray-100 rounded-lg", children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] })] }) }))] }));
}
