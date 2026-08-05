import { useMemo, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Badge, { type BadgeVariant } from '../../components/Badge';
import type { TableColumn } from '../../components/Table';
import type { ReturnStatus } from './types';

interface UseSupplierReturnsParams {
  returns: any[];
  saving: boolean;
  setSaving: (value: boolean) => void;
  showNotice: (tone: 'success' | 'error', message: string) => void;
  load: () => Promise<void>;
}

// The "Возврат поставщику" tab.
export function useSupplierReturns({ returns, saving, setSaving, showNotice, load }: UseSupplierReturnsParams) {
  const { tr, locale } = useAdminI18n();

  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState('');
  const [returnPurchaseOrderId, setReturnPurchaseOrderId] = useState('');
  const [returnCurrency, setReturnCurrency] = useState('USD');
  const [returnFxRate, setReturnFxRate] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [returnItems, setReturnItems] = useState([{ productId: '', qty: 1, unitCost: 0 }]);

  const returnStatusLabel: Record<ReturnStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  function returnStatusBadgeVariant(status: ReturnStatus): BadgeVariant {
    if (status === 'CONFIRMED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    return 'neutral';
  }

  const selectedReturn = returns.find((r: any) => r.id === selectedReturnId) ?? null;

  const returnColumns: TableColumn<any>[] = [
    {
      key: 'ret',
      header: 'RET#',
      render: (r) => (
        <span className="font-semibold text-neutral-800 inline-flex items-center gap-1.5">
          <span className={`transition-transform ${r.id === selectedReturnId ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
          RET-{r.returnNumber}
        </span>
      ),
    },
    { key: 'supplier', header: tr('Поставщик', 'Yetkazib beruvchi'), render: (r) => r.supplier?.name || r.supplierId },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (r) => <Badge variant={returnStatusBadgeVariant(r.status)}>{returnStatusLabel[r.status as ReturnStatus] || r.status}</Badge>,
    },
    {
      key: 'total',
      header: tr('Сумма', 'Summa'),
      render: (r) => <span className="font-semibold text-neutral-800">{Number(r.totalCost).toLocaleString(locale)} {r.currency}</span>,
    },
    { key: 'date', header: tr('Дата', 'Sana'), render: (r) => new Date(r.createdAt).toLocaleDateString(locale) },
  ];

  function resetCreateReturnForm() {
    setReturnSupplierId(''); setReturnPurchaseOrderId(''); setReturnCurrency('USD'); setReturnFxRate(''); setReturnNote('');
    setReturnItems([{ productId: '', qty: 1, unitCost: 0 }]);
    setShowCreateReturn(false);
  }

  function addReturnItem() {
    setReturnItems((prev) => [...prev, { productId: '', qty: 1, unitCost: 0 }]);
  }

  function removeReturnItem(idx: number) {
    setReturnItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateReturnItem(idx: number, field: string, value: string | number) {
    setReturnItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const returnCreateTotal = useMemo(
    () => returnItems.reduce((sum, item) => sum + (item.qty || 0) * (item.unitCost || 0), 0),
    [returnItems]
  );

  async function submitCreateReturn() {
    if (!returnSupplierId || returnItems.some((i) => !i.productId || !i.qty || !i.unitCost)) {
      showNotice('error', tr('Заполните все обязательные поля', "Barcha maydonlarni to'ldiring"));
      return;
    }
    setSaving(true);
    try {
      await adminApi.createSupplierReturn({
        supplierId: returnSupplierId,
        purchaseOrderId: returnPurchaseOrderId || undefined,
        currency: returnCurrency,
        fxRate: returnFxRate ? Number(returnFxRate) : undefined,
        note: returnNote.trim() || undefined,
        items: returnItems.map((i) => ({ productId: i.productId, qty: Number(i.qty), unitCost: Number(i.unitCost) })),
      });
      resetCreateReturnForm();
      await load();
      showNotice('success', tr('Возврат создан', 'Qaytarish yaratildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка создания', 'Yaratish xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelReturn(id: string) {
    setSaving(true);
    try {
      await adminApi.updateSupplierReturn(id, { status: 'CANCELLED' });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmReturn(id: string) {
    setSaving(true);
    try {
      await adminApi.confirmSupplierReturn(id);
      await load();
      showNotice('success', tr('Возврат подтверждён, остатки и долг обновлены', 'Qaytarish tasdiqlandi, qoldiq va qarz yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка подтверждения', 'Tasdiqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function addReturnItemToServer(returnId: string, data: { productId: string; qty: number; unitCost: number }) {
    setSaving(true);
    try {
      await adminApi.addSupplierReturnItem(returnId, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function updateReturnItemOnServer(returnId: string, itemId: string, data: { qty?: number; unitCost?: number }) {
    setSaving(true);
    try {
      await adminApi.updateSupplierReturnItem(returnId, itemId, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removeReturnItemOnServer(returnId: string, itemId: string) {
    setSaving(true);
    try {
      await adminApi.deleteSupplierReturnItem(returnId, itemId);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  return {
    selectedReturnId, setSelectedReturnId, selectedReturn,
    showCreateReturn, setShowCreateReturn,
    returnSupplierId, setReturnSupplierId,
    returnPurchaseOrderId, setReturnPurchaseOrderId,
    returnCurrency, setReturnCurrency, returnFxRate, setReturnFxRate,
    returnNote, setReturnNote,
    returnItems, addReturnItem, removeReturnItem, updateReturnItem, returnCreateTotal,
    returnColumns,
    resetCreateReturnForm, submitCreateReturn, cancelReturn, confirmReturn,
    addReturnItemToServer, updateReturnItemOnServer, removeReturnItemOnServer,
  };
}
