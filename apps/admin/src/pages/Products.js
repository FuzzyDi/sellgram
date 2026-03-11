import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useRef, useCallback } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';
const emptyForm = {
    name: '', sku: '', description: '', price: '', costPrice: '',
    stockQty: '0', lowStockAlert: '5', unit: 'шт', categoryId: '', isActive: true,
};
export default function Products() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showCatForm, setShowCatForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [catName, setCatName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    // Image management
    const [editImages, setEditImages] = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const loadProducts = useCallback(async () => {
        setLoading(true);
        try {
            const params = search ? `search=${encodeURIComponent(search)}` : '';
            const data = await adminApi.getProducts(params);
            setProducts(data.items || []);
            setTotal(data.total || 0);
        }
        catch { }
        setLoading(false);
    }, [search]);
    const loadCategories = async () => {
        try {
            const data = await adminApi.getCategories();
            setCategories(Array.isArray(data) ? data : data.items || []);
        }
        catch { }
    };
    useEffect(() => { loadProducts(); loadCategories(); }, []);
    const openCreate = useCallback(() => {
        setForm(emptyForm);
        setEditingId(null);
        setError('');
        setEditImages([]);
        setShowForm(true);
    }, []);
    const openEdit = useCallback(async (p) => {
        // Fetch full product to get all images
        let fullProduct = p;
        try {
            fullProduct = await adminApi.getProduct(p.id);
        }
        catch { }
        setForm({
            name: fullProduct.name, sku: fullProduct.sku || '', description: fullProduct.description || '', price: String(fullProduct.price),
            costPrice: fullProduct.costPrice ? String(fullProduct.costPrice) : '', stockQty: String(fullProduct.stockQty), lowStockAlert: String(fullProduct.lowStockAlert),
            unit: 'шт', categoryId: fullProduct.category?.id || '', isActive: fullProduct.isActive,
        });
        setEditingId(fullProduct.id);
        setEditImages(fullProduct.images || []);
        setError('');
        setShowForm(true);
    }, []);
    const handleSave = useCallback(async () => {
        if (!form.name || !form.price) {
            setError('Заполните название и цену');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = {
                name: form.name, price: parseFloat(form.price),
                stockQty: parseInt(form.stockQty) || 0, lowStockAlert: parseInt(form.lowStockAlert) || 5,
                isActive: form.isActive,
            };
            if (form.sku)
                payload.sku = form.sku;
            payload.description = form.description || null;
            if (form.costPrice)
                payload.costPrice = parseFloat(form.costPrice);
            if (form.unit)
                payload.unit = form.unit;
            if (form.categoryId)
                payload.categoryId = form.categoryId;
            if (editingId) {
                await adminApi.updateProduct(editingId, payload);
            }
            else {
                const created = await adminApi.createProduct(payload);
                setEditingId(created.id); // allow image upload right after creation
            }
            setShowForm(false);
            loadProducts();
        }
        catch (err) {
            setError(err.message || 'Ошибка сохранения');
        }
        setSaving(false);
    }, [form, editingId, loadProducts]);
    const handleDelete = useCallback(async (id, name) => {
        if (!confirm(`Удалить "${name}"?`))
            return;
        try {
            await adminApi.deleteProduct(id);
            loadProducts();
        }
        catch (err) {
            alert(err.message);
        }
    }, [loadProducts]);
    const handleCreateCategory = useCallback(async () => {
        if (!catName.trim())
            return;
        try {
            await adminApi.createCategory({ name: catName });
            setCatName('');
            setShowCatForm(false);
            loadCategories();
        }
        catch (err) {
            alert(err.message);
        }
    }, [catName]);
    // ── Image handlers ────────────────────────────────────
    const handleImageUpload = useCallback(async (e) => {
        const files = e.target.files;
        if (!files || !editingId)
            return;
        setUploading(true);
        for (const file of Array.from(files)) {
            try {
                const img = await adminApi.uploadProductImage(editingId, file);
                setEditImages(prev => [...prev, img]);
            }
            catch (err) {
                alert(`Ошибка загрузки ${file.name}: ${err.message}`);
            }
        }
        setUploading(false);
        loadProducts();
        if (fileInputRef.current)
            fileInputRef.current.value = '';
    }, [editingId, loadProducts]);
    const handleDeleteImage = useCallback(async (imageId) => {
        if (!editingId)
            return;
        try {
            await adminApi.deleteProductImage(editingId, imageId);
            setEditImages(prev => prev.filter(i => i.id !== imageId));
            loadProducts();
        }
        catch (err) {
            alert(err.message);
        }
    }, [editingId, loadProducts]);
    const updateForm = (field) => (e) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm(prev => ({ ...prev, [field]: val }));
    };
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }, children: [_jsx("h2", { className: "text-2xl font-bold", children: "\uD83C\uDFF7\uFE0F \u0422\u043E\u0432\u0430\u0440\u044B" }), _jsx(Button, { onClick: openCreate, className: "bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700", children: "+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" })] }), _jsx("div", { style: { marginBottom: 16 }, children: _jsxs("form", { onSubmit: (e) => { e.preventDefault(); loadProducts(); }, style: { display: 'flex', gap: 8 }, children: [_jsx("input", { value: search, onChange: e => setSearch(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E \u0438\u043B\u0438 SKU...", className: "flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" }), _jsx("button", { type: "submit", className: "px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200", children: "\uD83D\uDD0D" })] }) }), loading ? _jsx("p", { className: "text-gray-400", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }) : (_jsxs("div", { className: "bg-white rounded-xl border border-gray-200 overflow-hidden", children: [_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-gray-500 border-b bg-gray-50", children: [_jsx("th", { className: "px-4 py-3", children: "\u0424\u043E\u0442\u043E" }), _jsx("th", { className: "px-4 py-3", children: "\u0422\u043E\u0432\u0430\u0440" }), _jsx("th", { className: "px-4 py-3", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), _jsx("th", { className: "px-4 py-3", children: "\u0426\u0435\u043D\u0430" }), _jsx("th", { className: "px-4 py-3", children: "\u0421\u043A\u043B\u0430\u0434" }), _jsx("th", { className: "px-4 py-3", children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { className: "px-4 py-3 w-24", children: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" })] }) }), _jsxs("tbody", { children: [products.map(p => (_jsxs("tr", { className: "border-b last:border-0 hover:bg-gray-50", children: [_jsx("td", { className: "px-4 py-3", children: _jsx("div", { style: { width: 40, height: 40, borderRadius: 6, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, children: p.images?.[0]?.url ? _jsx("img", { src: p.images[0].url, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : _jsx("span", { children: "\uD83D\uDCE6" }) }) }), _jsxs("td", { className: "px-4 py-3", children: [_jsx("p", { className: "font-medium", children: p.name }), p.description && _jsx("p", { className: "text-xs text-gray-400 mt-0.5 line-clamp-1", style: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: p.description }), p.sku && _jsx("p", { className: "text-xs text-gray-500", children: p.sku })] }), _jsx("td", { className: "px-4 py-3 text-gray-500", children: p.category?.name || '—' }), _jsxs("td", { className: "px-4 py-3 font-medium", children: [Number(p.price).toLocaleString(), " UZS"] }), _jsx("td", { className: "px-4 py-3", children: _jsxs("span", { className: p.stockQty <= p.lowStockAlert ? 'text-red-500 font-medium' : '', children: [p.stockQty, " \u0448\u0442"] }) }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `px-2 py-1 rounded-full text-xs ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`, children: p.isActive ? 'Активен' : 'Скрыт' }) }), _jsx("td", { className: "px-4 py-3", children: _jsxs("div", { style: { display: 'flex', gap: 4 }, children: [_jsx(Button, { onClick: () => openEdit(p), className: "px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100", children: "\u270F\uFE0F" }), _jsx(Button, { onClick: () => handleDelete(p.id, p.name), className: "px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100", children: "\uD83D\uDDD1\uFE0F" })] }) })] }, p.id))), products.length === 0 && _jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-4 py-8 text-center text-gray-400", children: "\u0422\u043E\u0432\u0430\u0440\u043E\u0432 \u043D\u0435\u0442" }) })] })] }), total > 0 && _jsxs("div", { className: "px-4 py-3 text-sm text-gray-500 border-t", children: ["\u0412\u0441\u0435\u0433\u043E: ", total] })] })), showForm && (_jsx("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6", children: [_jsx("h3", { className: "text-lg font-bold mb-4", children: editingId ? '✏️ Редактировать товар' : '➕ Новый товар' }), error && _jsx("div", { className: "bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4", children: error }), _jsxs("form", { onSubmit: (e) => { e.preventDefault(); handleSave(); }, children: [_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 *" }), _jsx("input", { value: form.name, onChange: updateForm('name'), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", placeholder: "\u041F\u043B\u043E\u0432 \u043C\u0430\u0448\u0438\u043D\u043D\u044B\u0439" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "\u0426\u0435\u043D\u0430 (UZS) *" }), _jsx("input", { type: "number", value: form.price, onChange: updateForm('price'), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", placeholder: "35000" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "\u0421\u0435\u0431\u0435\u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C" }), _jsx("input", { type: "number", value: form.costPrice, onChange: updateForm('costPrice'), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "SKU" }), _jsx("input", { value: form.sku, onChange: updateForm('sku'), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", placeholder: "PLV-001" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "\u0415\u0434. \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F" }), _jsx("input", { value: form.unit, onChange: updateForm('unit'), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", placeholder: "\u0448\u0442" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "\u041D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435" }), _jsx("input", { type: "number", value: form.stockQty, onChange: updateForm('stockQty'), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "\u041C\u0438\u043D. \u043E\u0441\u0442\u0430\u0442\u043E\u043A" }), _jsx("input", { type: "number", value: form.lowStockAlert, onChange: updateForm('lowStockAlert'), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" })] })] }), _jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }, children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), _jsx(Button, { onClick: () => setShowCatForm(!showCatForm), className: "text-xs text-blue-600 hover:underline", children: "+ \u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E" })] }), showCatForm && (_jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 8 }, children: [_jsx("input", { value: catName, onChange: e => setCatName(e.target.value), className: "flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm", placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438" }), _jsx(Button, { onClick: handleCreateCategory, className: "px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg", children: "\u2713" })] })), _jsxs("select", { value: form.categoryId, onChange: updateForm('categoryId'), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", children: [_jsx("option", { value: "", children: "\u0411\u0435\u0437 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438" }), categories.map(c => _jsx("option", { value: c.id, children: c.name }, c.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsx("textarea", { value: form.description, onChange: updateForm('description'), rows: 3, className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", placeholder: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u0430..." })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("input", { type: "checkbox", checked: form.isActive, onChange: updateForm('isActive'), className: "rounded", id: "isActive" }), _jsx("label", { htmlFor: "isActive", className: "text-sm text-gray-700", children: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D (\u0432\u0438\u0434\u0435\u043D \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044F\u043C)" })] }), editingId && (_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "\uD83D\uDCF7 \u0424\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0438" }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }, children: [editImages.map(img => (_jsxs("div", { style: { position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }, children: [_jsx("img", { src: img.url, style: { width: '100%', height: '100%', objectFit: 'cover' } }), _jsx("button", { type: "button", onClick: () => handleDeleteImage(img.id), style: { position: 'absolute', top: 2, right: 2, background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: "\u00D7" })] }, img.id))), _jsxs("label", { style: { width: 80, height: 80, borderRadius: 8, border: '2px dashed #d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f9fafb' }, children: [_jsx("span", { style: { fontSize: 24 }, children: "\uD83D\uDCF7" }), _jsx("span", { style: { fontSize: 10, color: '#9ca3af' }, children: uploading ? '...' : 'Добавить' }), _jsx("input", { ref: fileInputRef, type: "file", accept: "image/*", multiple: true, onChange: handleImageUpload, style: { display: 'none' } })] })] })] })), !editingId && (_jsx("p", { className: "text-xs text-gray-400", children: "\uD83D\uDCA1 \u0424\u043E\u0442\u043E \u043C\u043E\u0436\u043D\u043E \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0442\u043E\u0432\u0430\u0440\u0430" }))] }), _jsxs("div", { style: { display: 'flex', gap: 12, marginTop: 24 }, children: [_jsx("button", { type: "submit", disabled: saving, className: "flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50", children: saving ? 'Сохранение...' : editingId ? 'Сохранить' : 'Создать товар' }), _jsx(Button, { onClick: () => setShowForm(false), className: "px-6 py-2.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200", children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] })] }) }))] }));
}
