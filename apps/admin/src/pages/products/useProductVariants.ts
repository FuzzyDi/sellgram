import { useCallback, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { Category, NoticeTone, PendingVariant, Variant } from './types';

// Variant state for the product being edited: generator, pending
// (unsaved) rows, and already-persisted variants. Reset synchronously
// via resetForProduct() from useProductForm's openEdit — not a
// useEffect keyed on editingId, so the modal never paints a stale
// variants list for a frame before resetting.
export function useProductVariants(editingId: string | null, categories: Category[], categoryId: string, showNotice: (tone: NoticeTone, message: string) => void) {
  const { tr } = useAdminI18n();
  const [editVariants, setEditVariants] = useState<Variant[]>([]);
  const [newVName, setNewVName] = useState('');
  const [newVPrice, setNewVPrice] = useState('');
  const [newVStock, setNewVStock] = useState('0');
  const [addingVariant, setAddingVariant] = useState(false);
  const [generatorValues, setGeneratorValues] = useState<Record<string, string>>({});
  const [pendingVariants, setPendingVariants] = useState<PendingVariant[]>([]);
  const [savingPending, setSavingPending] = useState(false);

  const resetForProduct = useCallback((fullProduct: any) => {
    setEditVariants(fullProduct.variants || []);
    setNewVName(''); setNewVPrice(''); setNewVStock('0');
    setGeneratorValues({});
    setPendingVariants([]);
  }, []);

  const addVariant = useCallback(async () => {
    if (!editingId || !newVName.trim()) return;
    setAddingVariant(true);
    try {
      const v = await adminApi.createProductVariant(editingId, {
        name: newVName.trim(),
        price: newVPrice ? parseFloat(newVPrice) : null,
        stockQty: parseInt(newVStock, 10) || 0,
      });
      setEditVariants((prev) => [...prev, v]);
      setNewVName(''); setNewVPrice(''); setNewVStock('0');
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setAddingVariant(false);
    }
  }, [editingId, newVName, newVPrice, newVStock, showNotice, tr]);

  const deleteVariant = useCallback(async (variantId: string) => {
    if (!editingId) return;
    try {
      await adminApi.deleteProductVariant(editingId, variantId);
      setEditVariants((prev) => prev.filter((v) => v.id !== variantId));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }, [editingId, showNotice, tr]);

  const toggleVariantActive = useCallback(async (variantId: string, isActive: boolean) => {
    if (!editingId) return;
    try {
      await adminApi.updateProductVariant(editingId, variantId, { isActive });
      setEditVariants((prev) => prev.map((v) => v.id === variantId ? { ...v, isActive } : v));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }, [editingId, showNotice, tr]);

  const generateVariants = useCallback(() => {
    const categoryAttrs = (categories.find((c) => c.id === categoryId)?.attributes || []);
    if (categoryAttrs.length === 0) return;

    const axes = categoryAttrs.map((attr) => {
      const raw = generatorValues[attr.name] || '';
      return raw.split(',').map((v) => v.trim()).filter(Boolean);
    });

    // Cartesian product of all axes
    const combinations: string[][] = axes.reduce<string[][]>(
      (acc, values) => acc.flatMap((combo) => values.map((v) => [...combo, v])),
      [[]]
    );

    const rows = combinations.map((combo) => ({
      name: combo.join(' / '),
      price: '',
      stockQty: '0',
    }));
    setPendingVariants(rows);
  }, [categories, categoryId, generatorValues]);

  const savePendingVariants = useCallback(async () => {
    if (!editingId || pendingVariants.length === 0) return;
    setSavingPending(true);
    try {
      const created: Variant[] = [];
      for (const row of pendingVariants) {
        if (!row.name.trim()) continue;
        const v = await adminApi.createProductVariant(editingId, {
          name: row.name.trim(),
          price: row.price ? parseFloat(row.price) : null,
          stockQty: parseInt(row.stockQty, 10) || 0,
        });
        created.push(v);
      }
      setEditVariants((prev) => [...prev, ...created]);
      setPendingVariants([]);
      setGeneratorValues({});
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSavingPending(false);
    }
  }, [editingId, pendingVariants, showNotice, tr]);

  return {
    editVariants, resetForProduct,
    newVName, setNewVName, newVPrice, setNewVPrice, newVStock, setNewVStock,
    addingVariant, addVariant, deleteVariant, toggleVariantActive,
    generatorValues, setGeneratorValues, generateVariants,
    pendingVariants, setPendingVariants, savingPending, savePendingVariants,
  };
}
