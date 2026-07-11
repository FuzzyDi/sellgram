import React, { useCallback, useRef, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import { emptyForm } from './types';
import type { FormData, NoticeTone, Product } from './types';

// Derives the VAT Select's single value from the two underlying Product
// columns (docs/POS_SYNC_API.md §10/§12; schema comment on Product).
// 'CUSTOM' is a hydration-only fallback for a vatRate that doesn't match
// any of the four options the Select actually offers — it's never a
// selectable <option>, so if the user doesn't touch the field, the
// payload builder below leaves vatRate/vatExempt untouched rather than
// silently overwriting a custom rate with the default on next save.
function vatOptionFromProduct(vatRate: unknown, vatExempt: boolean | undefined): string {
  if (vatExempt) return 'EXEMPT';
  if (vatRate === null || vatRate === undefined) return 'DEFAULT';
  const n = Number(vatRate);
  if (n === 12) return '12';
  if (n === 0) return '0';
  return 'CUSTOM';
}

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
      vatOption: vatOptionFromProduct(fullProduct.vatRate, fullProduct.vatExempt),
      markType: fullProduct.markType || '',
      description: fullProduct.description || '',
      price: String(fullProduct.price),
      costPrice: fullProduct.costPrice ? String(fullProduct.costPrice) : '',
      stockQty: String(fullProduct.stockQty),
      lowStockAlert: String(fullProduct.lowStockAlert),
      unit: fullProduct.unit || 'шт',
      isByWeight: Boolean(fullProduct.isByWeight),
      isWeightedPiece: Boolean(fullProduct.isWeightedPiece),
      pluCode: fullProduct.pluCode || '',
      pricePerKg: fullProduct.pricePerKg != null ? String(fullProduct.pricePerKg) : '',
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

      // Always sent (like isActive/description below), not gated on
      // truthiness — a Select always has a defined value, and switching
      // back to "default"/"not marked" must actually clear the previous
      // value server-side, unlike a blank text input.
      if (form.vatOption === 'DEFAULT') {
        payload.vatRate = null;
        payload.vatExempt = false;
      } else if (form.vatOption === '12') {
        payload.vatRate = 12;
        payload.vatExempt = false;
      } else if (form.vatOption === '0') {
        payload.vatRate = 0;
        payload.vatExempt = false;
      } else if (form.vatOption === 'EXEMPT') {
        payload.vatRate = null;
        payload.vatExempt = true;
      }
      // 'CUSTOM' (hydration-only, see vatOptionFromProduct) has no
      // matching branch — vatRate/vatExempt are deliberately left out of
      // the payload so an untouched custom rate isn't overwritten.

      payload.markType = form.markType || null;
      payload.isMarked = Boolean(form.markType);

      payload.description = form.description || null;
      if (form.costPrice) payload.costPrice = parseFloat(form.costPrice);
      if (form.unit) payload.unit = form.unit;

      // Always sent, same reasoning as vatOption/markType above — a
      // checkbox always has a defined value. isWeightedPiece/pluCode/
      // pricePerKg are explicitly cleared (not just left out) when
      // isByWeight is false, so toggling it off actually clears them
      // server-side instead of leaving stale hidden-field state that
      // resurfaces on a later unrelated save.
      payload.isByWeight = form.isByWeight;
      payload.isWeightedPiece = form.isByWeight && form.isWeightedPiece;
      payload.pluCode = form.isByWeight && form.pluCode ? form.pluCode : null;
      payload.pricePerKg = form.isByWeight && form.pricePerKg ? parseFloat(form.pricePerKg) : null;

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
