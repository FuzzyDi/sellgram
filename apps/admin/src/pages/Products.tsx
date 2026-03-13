import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
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

interface Category {
  id: string;
  name: string;
}

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
    } catch {
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await adminApi.getCategories();
      setCategories(Array.isArray(data) ? data : data.items || []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, [loadProducts, loadCategories]);

  const openCreate = useCallback(() => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setEditImages([]);
    setShowForm(true);
  }, []);

  const openEdit = useCallback(async (product: Product) => {
    let fullProduct = product;
    try {
      fullProduct = await adminApi.getProduct(product.id);
    } catch {
      // fallback to list data
    }

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

  const saveProduct = useCallback(async () => {
    if (!form.name.trim() || !form.price) {
      setError(tr('Заполните название и цену', 'Nomi va narxini kiriting'));
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload: any = {
        name: form.name.trim(),
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
      await loadProducts();
    } catch (err: any) {
      setError(err.message || tr('Ошибка сохранения', 'Saqlashda xatolik'));
    } finally {
      setSaving(false);
    }
  }, [editingId, form, loadProducts, tr]);

  const removeProduct = useCallback(
    async (id: string, name: string) => {
      if (!confirm(tr(`Удалить "${name}"?`, `"${name}" o'chirilsinmi?`))) return;
      try {
        await adminApi.deleteProduct(id);
        await loadProducts();
      } catch (err: any) {
        alert(err.message);
      }
    },
    [loadProducts, tr]
  );

  const createCategory = useCallback(async () => {
    const nextName = catName.trim();
    if (!nextName) return;
    try {
      await adminApi.createCategory({ name: nextName });
      setCatName('');
      setShowCatForm(false);
      await loadCategories();
    } catch (err: any) {
      alert(err.message);
    }
  }, [catName, loadCategories]);

  const uploadImages = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || !editingId) return;

      setUploading(true);
      for (const file of Array.from(files)) {
        try {
          const image = await adminApi.uploadProductImage(editingId, file);
          setEditImages((prev) => [...prev, image]);
        } catch (err: any) {
          alert(`${tr('Ошибка загрузки', 'Yuklash xatosi')} ${file.name}: ${err.message}`);
        }
      }
      setUploading(false);

      await loadProducts();
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [editingId, loadProducts, tr]
  );

  const removeImage = useCallback(
    async (imageId: string) => {
      if (!editingId) return;
      try {
        await adminApi.deleteProductImage(editingId, imageId);
        setEditImages((prev) => prev.filter((i) => i.id !== imageId));
        await loadProducts();
      } catch (err: any) {
        alert(err.message);
      }
    },
    [editingId, loadProducts]
  );

  const updateForm = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 className="sg-title">{tr('Товары', 'Mahsulotlar')}</h2>
          <p className="sg-subtitle">{tr('Каталог магазина и остатки', "Do'kon katalogi va ombor qoldiqlari")}</p>
        </div>
        <button className="sg-btn primary" type="button" onClick={openCreate}>
          + {tr('Добавить', "Qo'shish")}
        </button>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          loadProducts();
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr('Поиск по названию или SKU...', "Nomi yoki SKU bo'yicha qidirish...")}
          className="w-full"
          style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px' }}
        />
        <button className="sg-btn ghost" type="submit">
          {tr('Найти', 'Qidirish')}
        </button>
      </form>

      {loading ? (
        <p className="sg-subtitle">{tr('Загрузка...', 'Yuklanmoqda...')}</p>
      ) : (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th>{tr('Фото', 'Rasm')}</th>
                <th>{tr('Товар', 'Mahsulot')}</th>
                <th>{tr('Категория', 'Toifa')}</th>
                <th>{tr('Цена', 'Narx')}</th>
                <th>{tr('Склад', 'Ombor')}</th>
                <th>{tr('Статус', 'Holat')}</th>
                <th>{tr('Действия', 'Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 8,
                        background: '#eef3f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {product.images?.[0]?.url ? (
                        <img src={product.images[0].url} alt="product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: '#708077' }}>-</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{product.name}</div>
                    {product.description && <div style={{ fontSize: 12, color: '#64756b' }}>{product.description}</div>}
                    {product.sku && <div style={{ fontSize: 12, color: '#7a8a81' }}>{product.sku}</div>}
                  </td>
                  <td>{product.category?.name || '-'}</td>
                  <td style={{ fontWeight: 700 }}>{Number(product.price).toLocaleString()} UZS</td>
                  <td>
                    <span style={{ color: product.stockQty <= product.lowStockAlert ? '#c0392b' : 'inherit', fontWeight: 700 }}>
                      {product.stockQty} {tr('шт', 'dona')}
                    </span>
                  </td>
                  <td>
                    <span
                      className="sg-badge"
                      style={{
                        background: product.isActive ? '#e8f7ef' : '#eef1f0',
                        color: product.isActive ? '#0b7f57' : '#5f6d64',
                      }}
                    >
                      {product.isActive ? tr('Активен', 'Faol') : tr('Скрыт', 'Yashirin')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="sg-btn ghost" type="button" onClick={() => openEdit(product)}>
                        {tr('Изменить', 'Tahrirlash')}
                      </button>
                      <button className="sg-btn danger" type="button" onClick={() => removeProduct(product.id, product.name)}>
                        {tr('Удалить', "O'chirish")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#6b7a71' }}>
                    {tr('Товаров нет', "Mahsulotlar yo'q")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {total > 0 && (
            <div style={{ padding: '12px 14px', borderTop: '1px solid #edf2ee', color: '#5f6d64', fontSize: 13 }}>
              {tr('Всего', 'Jami')}: {total}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div className="sg-card" style={{ width: '100%', maxWidth: 860, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
              {editingId ? tr('Редактировать товар', 'Mahsulotni tahrirlash') : tr('Новый товар', 'Yangi mahsulot')}
            </h3>
            <p className="sg-subtitle">{tr('Управляйте карточкой товара и медиа', "Mahsulot kartasi va media fayllarni boshqaring")}</p>

            {error && (
              <div style={{ marginTop: 10, background: '#fff2f2', color: '#b52d2d', border: '1px solid #ffd6d6', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveProduct();
              }}
              className="sg-grid"
              style={{ gap: 12, marginTop: 12 }}
            >
              <div className="sg-grid cols-2">
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('Название', 'Nomi')} *</label>
                  <input value={form.name} onChange={updateForm('name')} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('SKU', 'SKU')}</label>
                  <input value={form.sku} onChange={updateForm('sku')} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} />
                </div>
              </div>

              <div className="sg-grid cols-3">
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('Цена (UZS)', 'Narx (UZS)')} *</label>
                  <input type="number" value={form.price} onChange={updateForm('price')} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('Себестоимость', 'Tannarx')}</label>
                  <input type="number" value={form.costPrice} onChange={updateForm('costPrice')} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('Ед. измерения', "O'lchov birligi")}</label>
                  <input value={form.unit} onChange={updateForm('unit')} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} />
                </div>
              </div>

              <div className="sg-grid cols-3">
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('Остаток', 'Qoldiq')}</label>
                  <input type="number" value={form.stockQty} onChange={updateForm('stockQty')} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('Мин. остаток', 'Min. qoldiq')}</label>
                  <input type="number" value={form.lowStockAlert} onChange={updateForm('lowStockAlert')} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('Категория', 'Toifa')}</label>
                  <select value={form.categoryId} onChange={updateForm('categoryId')} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}>
                    <option value="">{tr('Без категории', 'Toifasiz')}</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <button className="sg-btn ghost" type="button" onClick={() => setShowCatForm((prev) => !prev)}>
                  + {tr('Создать категорию', 'Toifa yaratish')}
                </button>
                {showCatForm && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      className="w-full"
                      style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                      placeholder={tr('Название категории', 'Toifa nomi')}
                    />
                    <button className="sg-btn primary" type="button" onClick={createCategory}>
                      {tr('Создать', 'Yaratish')}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('Описание', 'Tavsif')}</label>
                <textarea
                  value={form.description}
                  onChange={updateForm('description')}
                  rows={3}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', resize: 'vertical' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.isActive} onChange={updateForm('isActive')} />
                {tr('Активен (виден покупателям)', "Faol (mijozlarga ko'rinadi)")}
              </label>

              {editingId && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>{tr('Фотографии', 'Rasmlar')}</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {editImages.map((image) => (
                      <div key={image.id} style={{ width: 88, height: 88, borderRadius: 10, overflow: 'hidden', position: 'relative', border: '1px solid #dce4de' }}>
                        <img src={image.url} alt="product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button"
                          onClick={() => removeImage(image.id)}
                          style={{
                            position: 'absolute',
                            right: 4,
                            top: 4,
                            background: '#d93535',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: 20,
                            height: 20,
                            cursor: 'pointer',
                          }}
                        >
                          x
                        </button>
                      </div>
                    ))}
                    <label
                      style={{
                        width: 88,
                        height: 88,
                        borderRadius: 10,
                        border: '2px dashed #ced9d2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#5f6d64',
                        fontSize: 12,
                      }}
                    >
                      {uploading ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Добавить', "Qo'shish")}
                      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={uploadImages} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>
              )}

              {!editingId && <p className="sg-subtitle">{tr('Фото можно добавить после создания товара', "Rasmni mahsulot yaratilgandan keyin qo'shish mumkin")}</p>}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="sg-btn primary" type="submit" disabled={saving}>
                  {saving
                    ? tr('Сохранение...', 'Saqlanmoqda...')
                    : editingId
                    ? tr('Сохранить', 'Saqlash')
                    : tr('Создать товар', 'Mahsulot yaratish')}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => setShowForm(false)}>
                  {tr('Отмена', 'Bekor qilish')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
