import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi, toImageUrl } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { tr } = useAdminI18n();
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setFile(f);
    setError('');
    setLoading(true);
    try {
      const data = await adminApi.importProductsPreview(f);
      setPreview(data);
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const data = await adminApi.importProductsApply(file);
      setResult(data);
      setStep('done');
      onImported();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const validRows = preview?.rows?.filter((r: any) => r.errors.length === 0) ?? [];
  const invalidRows = preview?.rows?.filter((r: any) => r.errors.length > 0) ?? [];

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div className="sg-card" style={{ width: '100%', maxWidth: 780, maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('Импорт товаров', 'Mahsulotlarni import qilish')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#748278' }}>×</button>
        </div>

        {error && (
          <div style={{ background: '#fff2f2', color: '#b52d2d', border: '1px solid #ffd6d6', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
            {error}
          </div>
        )}

        {step === 'upload' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ background: '#f0faf4', borderRadius: 12, padding: '14px 16px', border: '1px solid #bbf0d8' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{tr('Формат файла', 'Fayl formati')}</p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#3d6b52' }}>
                {tr('Поддерживаются .xlsx, .xls, .csv. Обязательные колонки:', 'Qo\'llab-quvvatlanadi .xlsx, .xls, .csv. Majburiy ustunlar:')}
                {' '}<strong>name, price</strong>.
                {' '}{tr('Опциональные:', 'Ixtiyoriy:')} sku, description, category, stockQty, costPrice, unit, isActive
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="sg-btn ghost"
                onClick={() => adminApi.getImportTemplate().catch(() => {})}
                style={{ fontSize: 13 }}
              >
                ↓ {tr('Скачать шаблон CSV', 'CSV shablonni yuklab olish')}
              </button>
            </div>

            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: '2px dashed #ced9d2', borderRadius: 14, padding: '32px 16px', cursor: 'pointer',
              background: '#fafcfb', gap: 8,
            }}>
              <span style={{ fontSize: 36 }}>📂</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{loading ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Выбрать файл', 'Fayl tanlash')}</span>
              <span style={{ fontSize: 12, color: '#748278' }}>.xlsx, .xls, .csv — до 5 МБ</span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                disabled={loading}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </div>
        )}

        {step === 'preview' && preview && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="sg-card" style={{ flex: 1, minWidth: 100, textAlign: 'center', padding: '10px 8px' }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{preview.summary.total}</div>
                <div style={{ fontSize: 12, color: '#748278' }}>{tr('Строк', 'Qator')}</div>
              </div>
              <div className="sg-card" style={{ flex: 1, minWidth: 100, textAlign: 'center', padding: '10px 8px', borderColor: '#bbf0d8', background: '#f0faf4' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#065f46' }}>{preview.summary.valid}</div>
                <div style={{ fontSize: 12, color: '#3d6b52' }}>{tr('Готово к импорту', 'Import uchun tayyor')}</div>
              </div>
              {preview.summary.errors > 0 && (
                <div className="sg-card" style={{ flex: 1, minWidth: 100, textAlign: 'center', padding: '10px 8px', borderColor: '#fecaca', background: '#fff2f2' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#be123c' }}>{preview.summary.errors}</div>
                  <div style={{ fontSize: 12, color: '#be123c' }}>{tr('Ошибок', 'Xatolar')}</div>
                </div>
              )}
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', borderRadius: 10, border: '1px solid #e1e9e3' }}>
              <table className="sg-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{tr('Название', 'Nomi')}</th>
                    <th>{tr('Цена', 'Narx')}</th>
                    <th>SKU</th>
                    <th>{tr('Категория', 'Toifa')}</th>
                    <th>{tr('Остаток', 'Qoldiq')}</th>
                    <th>{tr('Действие', 'Amal')}</th>
                    <th>{tr('Статус', 'Holat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row: any) => (
                    <tr key={row.row} style={row.errors.length > 0 ? { background: '#fff5f5' } : undefined}>
                      <td style={{ color: '#748278' }}>{row.row}</td>
                      <td style={{ fontWeight: 600 }}>{row.name || '—'}</td>
                      <td>{row.price !== null ? `${Number(row.price).toLocaleString()} UZS` : '—'}</td>
                      <td>{row.sku || '—'}</td>
                      <td>{row.category || '—'}</td>
                      <td>{row.stockQty}</td>
                      <td>
                        <span className="sg-badge" style={row.action === 'update'
                          ? { background: '#dbeafe', color: '#1d4ed8' }
                          : { background: '#d1fae5', color: '#065f46' }}>
                          {row.action === 'update' ? tr('Обновить', 'Yangilash') : tr('Создать', 'Yaratish')}
                        </span>
                      </td>
                      <td>
                        {row.errors.length > 0 ? (
                          <span title={row.errors.join(', ')} style={{ color: '#be123c', cursor: 'help' }}>
                            ⚠ {row.errors[0]}{row.errors.length > 1 ? ` +${row.errors.length - 1}` : ''}
                          </span>
                        ) : (
                          <span style={{ color: '#065f46' }}>✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {validRows.length > 0 && (
                <button className="sg-btn primary" disabled={loading} onClick={handleApply}>
                  {loading ? tr('Импорт...', 'Import...') : tr(`Импортировать ${validRows.length} товар(ов)`, `${validRows.length} ta mahsulot import qilish`)}
                </button>
              )}
              <button className="sg-btn ghost" onClick={() => { setStep('upload'); setPreview(null); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                {tr('Другой файл', 'Boshqa fayl')}
              </button>
              <button className="sg-btn ghost" onClick={onClose}>{tr('Отмена', 'Bekor qilish')}</button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="sg-card" style={{ flex: 1, textAlign: 'center', padding: '14px 8px', borderColor: '#bbf0d8', background: '#f0faf4' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#065f46' }}>{result.summary.created}</div>
                <div style={{ fontSize: 13, color: '#3d6b52' }}>{tr('Создано', 'Yaratildi')}</div>
              </div>
              <div className="sg-card" style={{ flex: 1, textAlign: 'center', padding: '14px 8px', borderColor: '#bfdbfe', background: '#eff6ff' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#1d4ed8' }}>{result.summary.updated}</div>
                <div style={{ fontSize: 13, color: '#1d4ed8' }}>{tr('Обновлено', 'Yangilandi')}</div>
              </div>
              {result.summary.skipped > 0 && (
                <div className="sg-card" style={{ flex: 1, textAlign: 'center', padding: '14px 8px' }}>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{result.summary.skipped}</div>
                  <div style={{ fontSize: 13, color: '#748278' }}>{tr('Пропущено', 'O\'tkazib yuborildi')}</div>
                </div>
              )}
            </div>
            {result.summary.applyErrors?.length > 0 && (
              <div style={{ background: '#fff2f2', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#b52d2d' }}>
                {result.summary.applyErrors.map((e: any) => <div key={e.row}>Строка {e.row}: {e.error}</div>)}
              </div>
            )}
            <button className="sg-btn primary" onClick={onClose}>{tr('Готово', 'Tayyor')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

type NoticeTone = 'success' | 'error' | 'info';

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
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [editImages, setEditImages] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulking, setBulking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '20');
      if (search.trim()) params.set('search', search.trim());
      if (selectedCategory) params.set('categoryId', selectedCategory);
      if (activeFilter === 'active') params.set('active', 'true');
      if (activeFilter === 'hidden') params.set('active', 'false');

      const data = await adminApi.getProducts(params.toString());
      setProducts(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setSelected(new Set());
    } catch {
      setLoadError(true);
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, activeFilter, page]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await adminApi.getCategories();
      setCategories(Array.isArray(data) ? data : data.items || []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

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
        await adminApi.createProduct(payload);
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
    async (id: string) => {
      setPendingDelete(null);
      try {
        await adminApi.deleteProduct(id);
        await loadProducts();
      } catch (err: any) {
        showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
      }
    },
    [loadProducts, tr]
  );

  const handleBulkAction = useCallback(
    async (action: 'activate' | 'deactivate') => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      setBulking(true);
      try {
        await adminApi.bulkUpdateProducts({ ids, action });
        showNotice('success', tr(`Обновлено: ${ids.length}`, `Yangilandi: ${ids.length}`));
        await loadProducts();
      } catch (err: any) {
        showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
      } finally {
        setBulking(false);
      }
    },
    [selected, loadProducts, tr]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  };

  const createCategory = useCallback(async () => {
    const nextName = catName.trim();
    if (!nextName) return;
    try {
      await adminApi.createCategory({ name: nextName });
      setCatName('');
      setShowCatForm(false);
      await loadCategories();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
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
          showNotice('error', `${tr('Ошибка загрузки', 'Yuklash xatosi')} ${file.name}: ${err.message}`);
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
        showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
      }
    },
    [editingId, loadProducts]
  );

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const updateForm = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const noticeNode = notice ? (
    <div
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 70,
        minWidth: 280,
        maxWidth: 440,
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 14,
        fontWeight: 700,
        boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
        color: notice.tone === 'error' ? '#991b1b' : notice.tone === 'success' ? '#065f46' : '#1e3a8a',
        background: notice.tone === 'error' ? '#fee2e2' : notice.tone === 'success' ? '#d1fae5' : '#dbeafe',
        border: `1px solid ${notice.tone === 'error' ? '#fecaca' : notice.tone === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
      }}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 className="sg-title">{tr('Товары', 'Mahsulotlar')}</h2>
          <p className="sg-subtitle">{tr('Каталог магазина и остатки', "Do'kon katalogi va ombor qoldiqlari")}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="sg-btn ghost" type="button" onClick={() => setShowImport(true)}>
            ↑ {tr('Импорт', 'Import')}
          </button>
          <button className="sg-btn primary" type="button" onClick={openCreate}>
            + {tr('Добавить', "Qo'shish")}
          </button>
        </div>
      </header>

      <div className="sg-card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          placeholder={tr('Поиск по названию, описанию, SKU...', "Nomi, tavsifi, SKU bo'yicha qidirish...")}
          className="w-full"
          style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '10px 12px', minWidth: 240, flex: 1 }}
        />

        <select
          value={selectedCategory}
          onChange={(e) => { setPage(1); setSelectedCategory(e.target.value); }}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
        >
          <option value="">{tr('Все категории', 'Barcha toifalar')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          value={activeFilter}
          onChange={(e) => { setPage(1); setActiveFilter(e.target.value as 'all' | 'active' | 'hidden'); }}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
        >
          <option value="all">{tr('Любой статус', 'Har qanday holat')}</option>
          <option value="active">{tr('Только активные', 'Faqat faol')}</option>
          <option value="hidden">{tr('Только скрытые', 'Faqat yashirin')}</option>
        </select>

        {total > 0 && <span style={{ fontSize: 12, color: '#748278' }}>{tr('Всего', 'Jami')}: <strong>{total}</strong></span>}
      </div>

      {selected.size > 0 && (
        <div className="sg-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
            {tr(`Выбрано: ${selected.size}`, `Tanlandi: ${selected.size}`)}
          </span>
          <button
            className="sg-btn ghost"
            disabled={bulking}
            onClick={() => handleBulkAction('activate')}
            style={{ fontSize: 13, padding: '5px 12px' }}
          >
            {tr('Активировать', 'Faollashtirish')}
          </button>
          <button
            className="sg-btn ghost"
            disabled={bulking}
            onClick={() => handleBulkAction('deactivate')}
            style={{ fontSize: 13, padding: '5px 12px', color: '#6b7280' }}
          >
            {tr('Скрыть', 'Yashirish')}
          </button>
          <button
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9ca3af' }}
            onClick={() => setSelected(new Set())}
          >
            {tr('Отмена', 'Bekor')}
          </button>
        </div>
      )}

      {loadError ? (
        <div className="sg-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#be123c' }}>{tr('Не удалось загрузить товары', "Mahsulotlarni yuklab bo'lmadi")}</p>
          <button className="sg-btn ghost" style={{ marginTop: 14 }} onClick={() => void loadProducts()}>{tr('Повторить', 'Qayta urinish')}</button>
        </div>
      ) : loading ? (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid #edf2ee', alignItems: 'center' }}>
              <div className="sg-skeleton" style={{ width: 42, height: 42, borderRadius: 8, flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                <div className="sg-skeleton" style={{ height: 14, width: '40%' }} />
                <div className="sg-skeleton" style={{ height: 12, width: '25%' }} />
              </div>
              <div className="sg-skeleton" style={{ height: 24, width: 60 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={products.length > 0 && selected.size === products.length}
                    onChange={toggleSelectAll}
                  />
                </th>
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
                <tr key={product.id} style={selected.has(product.id) ? { background: '#fffbeb' } : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelect(product.id)} />
                  </td>
                  <td>
                    <div style={{ width: 42, height: 42, borderRadius: 8, background: '#eef3f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {product.images?.[0]?.url ? (
                        <img src={toImageUrl(product.images[0].url)} alt="product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    <span className="sg-badge" style={product.isActive
                      ? { background: '#d1fae5', color: '#065f46' }
                      : { background: '#f3f4f6', color: '#4b5563' }}>
                      {product.isActive ? tr('\u0410\u043a\u0442\u0438\u0432\u0435\u043d', 'Faol') : tr('\u0421\u043a\u0440\u044b\u0442', 'Yashirin')}
                    </span>
                  </td>
                  <td>
                    {pendingDelete === product.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#4b5563' }}>{tr('\u0423\u0434\u0430\u043b\u0438\u0442\u044c?', "O'chirish?")}</span>
                        <button className="sg-btn danger" type="button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => void removeProduct(product.id)}>
                          {tr('\u0414\u0430', 'Ha')}
                        </button>
                        <button className="sg-btn ghost" type="button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setPendingDelete(null)}>
                          {tr('\u041d\u0435\u0442', "Yo'q")}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="sg-btn ghost" type="button" onClick={() => openEdit(product)}>
                          {tr('\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c', 'Tahrirlash')}
                        </button>
                        <button className="sg-btn danger" type="button" onClick={() => setPendingDelete(product.id)}>
                          {tr('\u0423\u0434\u0430\u043b\u0438\u0442\u044c', "O'chirish")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: '#6b7a71' }}>
                    {tr('Товаров нет', "Mahsulotlar yo'q")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div style={{ padding: '12px 14px', borderTop: '1px solid #edf2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#748278' }}>
                {tr('Страница', 'Sahifa')} {page} / {totalPages}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="sg-btn ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {tr('Назад', 'Orqaga')}
                </button>
                <button className="sg-btn ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  {tr('Далее', 'Keyingi')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); void loadProducts(); }}
        />
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div className="sg-card" style={{ width: '100%', maxWidth: 860, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
              {editingId ? tr('Редактировать товар', 'Mahsulotni tahrirlash') : tr('Новый товар', 'Yangi mahsulot')}
            </h3>
            <p className="sg-subtitle">{tr('Управляйте карточкой товара и медиа', 'Mahsulot kartasi va media fayllarni boshqaring')}</p>

            {error && <div style={{ marginTop: 10, background: '#fff2f2', color: '#b52d2d', border: '1px solid #ffd6d6', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{error}</div>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveProduct();
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
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>SKU</label>
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
                    <input value={catName} onChange={(e) => setCatName(e.target.value)} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} placeholder={tr('Название категории', 'Toifa nomi')} />
                    <button className="sg-btn primary" type="button" onClick={() => void createCategory()}>
                      {tr('Создать', 'Yaratish')}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{tr('Описание', 'Tavsif')}</label>
                <textarea value={form.description} onChange={updateForm('description')} rows={3} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', resize: 'vertical' }} />
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
                        <img src={toImageUrl(image.url)} alt="product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button type="button" onClick={() => void removeImage(image.id)} style={{ position: 'absolute', right: 4, top: 4, background: '#d93535', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}>
                          x
                        </button>
                      </div>
                    ))}
                    <label style={{ width: 88, height: 88, borderRadius: 10, border: '2px dashed #ced9d2', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5f6d64', fontSize: 12 }}>
                      {uploading ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Добавить', "Qo'shish")}
                      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={uploadImages} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>
              )}

              {!editingId && <p className="sg-subtitle">{tr('Фото можно добавить после создания товара', "Rasmni mahsulot yaratilgandan keyin qo'shish mumkin")}</p>}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="sg-btn primary" type="submit" disabled={saving}>
                  {saving ? tr('Сохранение...', 'Saqlanmoqda...') : editingId ? tr('Сохранить', 'Saqlash') : tr('Создать товар', 'Mahsulot yaratish')}
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
