import React, { useEffect, useState, useRef, useCallback } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

interface Product {
  id: string;
  name: string;
  description?: string;
  sku: string;
  price: number;
  stockQty: number;
  lowStockAlert: number;
  isActive: boolean;
  category?: { id: string; name: string };
  images?: { id: string; url: string }[];
}

interface Category { id: string; name: string }

interface FormData {
  name: string;
  sku: string;
  description: string;
  price: string;
  costPrice: string;
  stockQty: string;
  lowStockAlert: string;
  unit: string;
  categoryId: string;
  isActive: boolean;
}

const emptyForm: FormData = {
  name: '',
  sku: '',
  description: '',
  price: '',
  costPrice: '',
  stockQty: '0',
  lowStockAlert: '5',
  unit: 'dona',
  categoryId: '',
  isActive: true,
};

export default function Products() {
  const { tr } = useAdminI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [catName, setCatName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editImages, setEditImages] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `search=${encodeURIComponent(search)}` : '';
      const data = await adminApi.getProducts(params);
      setProducts(data.items || []);
      setTotal(data.total || 0);
    } catch {}
    setLoading(false);
  }, [search]);

  const loadCategories = async () => {
    try {
      const data = await adminApi.getCategories();
      setCategories(Array.isArray(data) ? data : data.items || []);
    } catch {}
  };

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  const openCreate = useCallback(() => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setEditImages([]);
    setShowForm(true);
  }, []);

  const openEdit = useCallback(async (p: Product) => {
    let fullProduct = p;
    try {
      fullProduct = await adminApi.getProduct(p.id);
    } catch {}

    setForm({
      name: fullProduct.name,
      sku: fullProduct.sku || '',
      description: fullProduct.description || '',
      price: String(fullProduct.price),
      costPrice: (fullProduct as any).costPrice ? String((fullProduct as any).costPrice) : '',
      stockQty: String(fullProduct.stockQty),
      lowStockAlert: String(fullProduct.lowStockAlert),
      unit: (fullProduct as any).unit || 'dona',
      categoryId: fullProduct.category?.id || '',
      isActive: fullProduct.isActive,
    });

    setEditingId(fullProduct.id);
    setEditImages(fullProduct.images || []);
    setError('');
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name || !form.price) {
      setError(tr('Заполните название и цену', 'Nomi va narxini kiriting'));
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload: any = {
        name: form.name,
        price: parseFloat(form.price),
        stockQty: parseInt(form.stockQty, 10) || 0,
        lowStockAlert: parseInt(form.lowStockAlert, 10) || 5,
        isActive: form.isActive,
      };
      if (form.sku) payload.sku = form.sku;
      payload.description = form.description || null;
      if (form.costPrice) payload.costPrice = parseFloat(form.costPrice);
      if (form.unit) payload.unit = form.unit;
      if (form.categoryId) payload.categoryId = form.categoryId;

      if (editingId) {
        await adminApi.updateProduct(editingId, payload);
      } else {
        const created = await adminApi.createProduct(payload);
        setEditingId(created.id);
      }

      setShowForm(false);
      loadProducts();
    } catch (err: any) {
      setError(err.message || tr('Ошибка сохранения', 'Saqlashda xatolik'));
    }

    setSaving(false);
  }, [editingId, form, loadProducts, tr]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(tr(`Удалить "${name}"?`, `"${name}" o'chirilsinmi?`))) return;
    try {
      await adminApi.deleteProduct(id);
      loadProducts();
    } catch (err: any) {
      alert(err.message);
    }
  }, [loadProducts, tr]);

  const handleCreateCategory = useCallback(async () => {
    if (!catName.trim()) return;
    try {
      await adminApi.createCategory({ name: catName });
      setCatName('');
      setShowCatForm(false);
      loadCategories();
    } catch (err: any) {
      alert(err.message);
    }
  }, [catName]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !editingId) return;

    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const img = await adminApi.uploadProductImage(editingId, file);
        setEditImages((prev) => [...prev, img]);
      } catch (err: any) {
        alert(`${tr('Ошибка загрузки', 'Yuklash xatosi')} ${file.name}: ${err.message}`);
      }
    }
    setUploading(false);

    loadProducts();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [editingId, loadProducts, tr]);

  const handleDeleteImage = useCallback(async (imageId: string) => {
    if (!editingId) return;
    try {
      await adminApi.deleteProductImage(editingId, imageId);
      setEditImages((prev) => prev.filter((i) => i.id !== imageId));
      loadProducts();
    } catch (err: any) {
      alert(err.message);
    }
  }, [editingId, loadProducts]);

  const updateForm = (field: keyof FormData) => (e: any) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 className="text-2xl font-bold">🏷️ {tr('Товары', 'Mahsulotlar')}</h2>
        <Button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">+ {tr('Добавить', "Qo'shish")}</Button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); loadProducts(); }} style={{ display: 'flex', gap: 8 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('Поиск по названию или SKU...', 'Nomi yoki SKU bo\'yicha qidirish...')}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button type="submit" className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">🔍</button>
        </form>
      </div>

      {loading ? <p className="text-gray-400">{tr('Загрузка...', 'Yuklanmoqda...')}</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-3">{tr('Фото', 'Rasm')}</th>
              <th className="px-4 py-3">{tr('Товар', 'Mahsulot')}</th>
              <th className="px-4 py-3">{tr('Категория', 'Toifa')}</th>
              <th className="px-4 py-3">{tr('Цена', 'Narx')}</th>
              <th className="px-4 py-3">{tr('Склад', 'Ombor')}</th>
              <th className="px-4 py-3">{tr('Статус', 'Holat')}</th>
              <th className="px-4 py-3 w-24">{tr('Действия', 'Amallar')}</th>
            </tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div style={{ width: 40, height: 40, borderRadius: 6, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {p.images?.[0]?.url ? <img src={p.images[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>📦</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-400 mt-0.5" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</p>}
                    {p.sku && <p className="text-xs text-gray-500">{p.sku}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.category?.name || '—'}</td>
                  <td className="px-4 py-3 font-medium">{Number(p.price).toLocaleString()} UZS</td>
                  <td className="px-4 py-3">
                    <span className={p.stockQty <= p.lowStockAlert ? 'text-red-500 font-medium' : ''}>{p.stockQty} {tr('шт', 'dona')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.isActive ? tr('Активен', 'Faol') : tr('Скрыт', 'Yashirin')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button onClick={() => openEdit(p)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">✏️</Button>
                      <Button onClick={() => handleDelete(p.id, p.name)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">🗑️</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{tr('Товаров нет', "Mahsulotlar yo'q")}</td></tr>}
            </tbody>
          </table>
          {total > 0 && <div className="px-4 py-3 text-sm text-gray-500 border-t">{tr('Всего', 'Jami')}: {total}</div>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold mb-4">{editingId ? tr('Редактировать товар', 'Mahsulotni tahrirlash') : tr('Новый товар', 'Yangi mahsulot')}</h3>

            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Название', 'Nomi')} *</label>
                  <input value={form.name} onChange={updateForm('name')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder={tr('Плов машинный', 'Masalliqli osh')} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Цена (UZS)', 'Narx (UZS)')} *</label>
                    <input type="number" value={form.price} onChange={updateForm('price')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="35000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Себестоимость', 'Tannarx')}</label>
                    <input type="number" value={form.costPrice} onChange={updateForm('costPrice')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                    <input value={form.sku} onChange={updateForm('sku')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="PLV-001" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Ед. измерения', 'O\'lchov birligi')}</label>
                    <input value={form.unit} onChange={updateForm('unit')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder={tr('шт', 'dona')} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('На складе', 'Omborda')}</label>
                    <input type="number" value={form.stockQty} onChange={updateForm('stockQty')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Мин. остаток', 'Min. qoldiq')}</label>
                    <input type="number" value={form.lowStockAlert} onChange={updateForm('lowStockAlert')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="block text-sm font-medium text-gray-700">{tr('Категория', 'Toifa')}</label>
                    <Button onClick={() => setShowCatForm(!showCatForm)} className="text-xs text-blue-600 hover:underline">+ {tr('Создать категорию', 'Toifa yaratish')}</Button>
                  </div>
                  {showCatForm && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input value={catName} onChange={(e) => setCatName(e.target.value)} className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder={tr('Название категории', 'Toifa nomi')} />
                      <Button onClick={handleCreateCategory} className="px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg">✓</Button>
                    </div>
                  )}
                  <select value={form.categoryId} onChange={updateForm('categoryId')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">{tr('Без категории', 'Toifasiz')}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Описание', 'Tavsif')}</label>
                  <textarea value={form.description} onChange={updateForm('description')} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder={tr('Описание товара...', 'Mahsulot tavsifi...')} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={form.isActive} onChange={updateForm('isActive')} className="rounded" id="isActive" />
                  <label htmlFor="isActive" className="text-sm text-gray-700">{tr('Активен (виден покупателям)', 'Faol (mijozlarga ko\'rinadi)')}</label>
                </div>

                {editingId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">📷 {tr('Фотографии', 'Rasmlar')}</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {editImages.map((img) => (
                        <div key={img.id} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                          <img src={img.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(img.id)}
                            style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <label style={{ width: 80, height: 80, borderRadius: 8, border: '2px dashed #d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f9fafb' }}>
                        <span style={{ fontSize: 24 }}>📷</span>
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>{uploading ? '...' : tr('Добавить', "Qo'shish")}</span>
                        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>
                )}

                {!editingId && <p className="text-xs text-gray-400">💡 {tr('Фото можно добавить после создания товара', 'Rasmni mahsulot yaratilgandan keyin qo\'shasiz')}</p>}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? tr('Сохранение...', 'Saqlanmoqda...') : editingId ? tr('Сохранить', 'Saqlash') : tr('Создать товар', 'Mahsulot yaratish')}
                </button>
                <Button onClick={() => setShowForm(false)} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">{tr('Отмена', 'Bekor qilish')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
