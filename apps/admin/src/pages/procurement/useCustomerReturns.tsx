import { useMemo, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Badge, { type BadgeVariant } from '../../components/Badge';
import type { TableColumn } from '../../components/Table';
import type { CustomerReturnStatus } from './types';

interface UseCustomerReturnsParams {
  customerReturns: any[];
  saving: boolean;
  setSaving: (value: boolean) => void;
  showNotice: (tone: 'success' | 'error', message: string) => void;
  load: () => Promise<void>;
}

// The "Возврат от клиента" tab.
export function useCustomerReturns({ customerReturns, saving, setSaving, showNotice, load }: UseCustomerReturnsParams) {
  const { tr, locale } = useAdminI18n();

  const [selectedCustomerReturnId, setSelectedCustomerReturnId] = useState<string | null>(null);
  const [showCreateCustomerReturn, setShowCreateCustomerReturn] = useState(false);
  const [crCounterpartyId, setCrCounterpartyId] = useState('');
  const [crNote, setCrNote] = useState('');
  const [crItems, setCrItems] = useState([{ productId: '', qty: 1, unitCost: 0 }]);

  const customerReturnStatusLabel: Record<CustomerReturnStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  function customerReturnStatusBadgeVariant(status: CustomerReturnStatus): BadgeVariant {
    if (status === 'CONFIRMED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    return 'neutral';
  }

  const selectedCustomerReturn = customerReturns.find((r: any) => r.id === selectedCustomerReturnId) ?? null;

  const customerReturnColumns: TableColumn<any>[] = [
    {
      key: 'cr',
      header: 'CR#',
      render: (r) => (
        <span className="font-semibold text-neutral-800 inline-flex items-center gap-1.5">
          <span className={`transition-transform ${r.id === selectedCustomerReturnId ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
          CR-{r.returnNumber}
        </span>
      ),
    },
    { key: 'counterparty', header: tr('Клиент', 'Mijoz'), render: (r) => r.counterparty?.name || tr('— без привязки —', "— bog'lanmagan —") },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (r) => <Badge variant={customerReturnStatusBadgeVariant(r.status)}>{customerReturnStatusLabel[r.status as CustomerReturnStatus] || r.status}</Badge>,
    },
    {
      key: 'total',
      header: tr('Сумма', 'Summa'),
      render: (r) => <span className="font-semibold text-neutral-800">{Number(r.totalCost).toLocaleString(locale)}</span>,
    },
    { key: 'date', header: tr('Дата', 'Sana'), render: (r) => new Date(r.createdAt).toLocaleDateString(locale) },
  ];

  function resetCreateCustomerReturnForm() {
    setCrCounterpartyId(''); setCrNote('');
    setCrItems([{ productId: '', qty: 1, unitCost: 0 }]);
    setShowCreateCustomerReturn(false);
  }

  function addCustomerReturnItem() {
    setCrItems((prev) => [...prev, { productId: '', qty: 1, unitCost: 0 }]);
  }

  function removeCustomerReturnItem(idx: number) {
    setCrItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateCustomerReturnItem(idx: number, field: string, value: string | number) {
    setCrItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const customerReturnCreateTotal = useMemo(
    () => crItems.reduce((sum, item) => sum + (item.qty || 0) * (item.unitCost || 0), 0),
    [crItems]
  );

  async function submitCreateCustomerReturn() {
    if (crItems.some((i) => !i.productId || !i.qty)) {
      showNotice('error', tr('Заполните все обязательные поля', "Barcha maydonlarni to'ldiring"));
      return;
    }
    setSaving(true);
    try {
      await adminApi.createCustomerReturn({
        counterpartyId: crCounterpartyId || undefined,
        note: crNote.trim() || undefined,
        items: crItems.map((i) => ({ productId: i.productId, qty: Number(i.qty), unitCost: Number(i.unitCost) })),
      });
      resetCreateCustomerReturnForm();
      await load();
      showNotice('success', tr('Возврат создан', 'Qaytarish yaratildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка создания', 'Yaratish xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelCustomerReturn(id: string) {
    setSaving(true);
    try {
      await adminApi.updateCustomerReturn(id, { status: 'CANCELLED' });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmCustomerReturn(id: string) {
    setSaving(true);
    try {
      await adminApi.confirmCustomerReturn(id);
      await load();
      showNotice('success', tr('Возврат подтверждён, остатки обновлены', 'Qaytarish tasdiqlandi, qoldiqlar yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка подтверждения', 'Tasdiqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function addCustomerReturnItemToServer(id: string, data: { productId: string; qty: number; unitCost: number }) {
    setSaving(true);
    try {
      await adminApi.addCustomerReturnItem(id, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function updateCustomerReturnItemOnServer(id: string, itemId: string, data: { qty?: number; unitCost?: number }) {
    setSaving(true);
    try {
      await adminApi.updateCustomerReturnItem(id, itemId, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removeCustomerReturnItemOnServer(id: string, itemId: string) {
    setSaving(true);
    try {
      await adminApi.deleteCustomerReturnItem(id, itemId);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  return {
    selectedCustomerReturnId, setSelectedCustomerReturnId, selectedCustomerReturn,
    showCreateCustomerReturn, setShowCreateCustomerReturn,
    crCounterpartyId, setCrCounterpartyId, crNote, setCrNote,
    crItems, addCustomerReturnItem, removeCustomerReturnItem, updateCustomerReturnItem, customerReturnCreateTotal,
    customerReturnColumns,
    resetCreateCustomerReturnForm, submitCreateCustomerReturn, cancelCustomerReturn, confirmCustomerReturn,
    addCustomerReturnItemToServer, updateCustomerReturnItemOnServer, removeCustomerReturnItemOnServer,
  };
}
