import React, { useCallback, useRef, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import { emptyForm } from './types';
import type { FormData, NoticeTone, Product } from './types';

interface UseProductFormParams {
  loadProducts: () => Promise<void>;
  loadCategories: () => Promise<void>;
  showNotice: (tone: NoticeTone, message: string) => void;
  onEditLoaded: (fullProduct: any) => void;
}

// Create/edit modal state: the form itself, inline category creation,
// and image upload. Variant management lives in useProductVariants —
// openEdit calls onEditLoaded synchronously (before setShowForm(true))
// so the caller can reset variant state in the same tick, matching the
// original single-component ordering exactly (no useEffect indirection).
export function useProductForm({ loadProducts, loadCategories, showNotice, onEditLoaded }: UseProductFormParams) {
  const { tr } = useAdminI18n();
  const [showForm, setShowForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [catName, setCatName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editImages, setEditImages] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openCreate = useCallback(() => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setEditImages([]);
    setShowForm(true);
  }, []);

  const openEdit = useCallback(async (product: Product) => {
    let fullProduct: any = product;
    try {
      fullProduct = await adminApi.getProduct(product.id);
    } catch {
      // fallback to list data
    }

    setForm({
      name: fullProduct.name,
      sku: fullProduct.sku || '',
      mxikCode: fullProduct.mxikCode || '',
      packageCode: fullProduct.packageCode || '',
      description: fullProduct.description || '',
      price: String(fullProduct.price),
      costPrice: fullProduct.costPrice ? String(fullProduct.costPrice) : '',
      stockQty: String(fullProduct.stockQty),
      lowStockAlert: String(fullProduct.lowStockAlert),
      unit: fullProduct.unit || 'dona',
      categoryId: fullProduct.category?.id || '',
      isActive: fullProduct.isActive,
    });

    setEditingId(fullProduct.id);
    setEditImages(fullProduct.images || []);
    onEditLoaded(fullProduct);
    setError('');
    setShowForm(true);
  }, [onEditLoaded]);

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
      if (form.mxikCode) payload.mxikCode = form.mxikCode;
      if (form.packageCode) payload.packageCode = form.packageCode;
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

  const createCategory = useCallback(async () => {
    const nextName = catName.trim();
    if (!nextName) return;
    try {
      await adminApi.createCategory({ name: nextName });
      setCatName('');
      setShowCatForm(false);
      await loadCategories();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }, [catName, loadCategories, showNotice, tr]);

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
    [editingId, loadProducts, showNotice, tr]
  );

  const removeImage = useCallback(
    async (imageId: string) => {
      if (!editingId) return;
      try {
        await adminApi.deleteProductImage(editingId, imageId);
        setEditImages((prev) => prev.filter((i) => i.id !== imageId));
        await loadProducts();
      } catch (err: any) {
        showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
      }
    },
    [editingId, loadProducts, showNotice, tr]
  );

  const updateForm = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return {
    showForm, setShowForm, showCatForm, setShowCatForm, editingId, form, updateForm,
    catName, setCatName, saving, error, editImages, uploading, fileInputRef,
    openCreate, openEdit, saveProduct, createCategory, uploadImages, removeImage,
  };
}
