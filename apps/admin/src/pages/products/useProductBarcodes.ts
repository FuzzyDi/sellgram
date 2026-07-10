import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { NoticeTone, ProductBarcode } from './types';

// Barcode list + add-form state for the product being edited. Unlike
// useProductVariants, this isn't reset synchronously from
// useProductForm's openEdit — there's no circular data need here, so a
// plain fetch keyed on editingId is enough (BarcodesSection only renders
// when editingId is set, matching ProductForm.tsx's own gating).
export function useProductBarcodes(editingId: string | null, showNotice: (tone: NoticeTone, message: string) => void) {
  const { tr } = useAdminI18n();
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const [newBarcode, setNewBarcode] = useState('');
  const [newType, setNewType] = useState('EAN13');
  const [newUnitQty, setNewUnitQty] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);

  const load = useCallback(async () => {
    if (!editingId) {
      setBarcodes([]);
      return;
    }
    setLoading(true);
    try {
      const list = await adminApi.getProductBarcodes(editingId);
      setBarcodes(Array.isArray(list) ? list : []);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить штрихкоды', "Shtrix-kodlarni yuklab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  }, [editingId, showNotice, tr]);

  useEffect(() => { void load(); }, [load]);

  function resetNewForm() {
    setNewBarcode('');
    setNewType('EAN13');
    setNewUnitQty('');
    setNewIsDefault(false);
  }

  const addBarcode = useCallback(async () => {
    if (!editingId || !newBarcode.trim()) return;
    setSaving(true);
    try {
      await adminApi.createProductBarcode(editingId, {
        barcode: newBarcode.trim(),
        type: newType,
        isDefault: newIsDefault,
        unitQty: newUnitQty ? parseFloat(newUnitQty) : undefined,
      });
      resetNewForm();
      await load();
    } catch (err: any) {
      const message = String(err?.message || '');
      showNotice(
        'error',
        message.includes('BARCODE_ALREADY_EXISTS')
          ? tr('Такой штрихкод уже существует', "Bunday shtrix-kod allaqachon mavjud")
          : message || tr('Ошибка сохранения', 'Saqlashda xato')
      );
    } finally {
      setSaving(false);
    }
  }, [editingId, newBarcode, newType, newUnitQty, newIsDefault, load, showNotice, tr]);

  const deleteBarcode = useCallback(async (barcodeId: string) => {
    if (!editingId) return;
    setPendingDelete(null);
    try {
      await adminApi.deleteProductBarcode(editingId, barcodeId);
      setBarcodes((prev) => prev.filter((b) => b.id !== barcodeId));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }, [editingId, showNotice, tr]);

  return {
    barcodes, loading, saving,
    newBarcode, setNewBarcode, newType, setNewType, newUnitQty, setNewUnitQty, newIsDefault, setNewIsDefault,
    addBarcode, deleteBarcode, pendingDelete, setPendingDelete,
  };
}
