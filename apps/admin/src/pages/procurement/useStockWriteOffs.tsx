import { useMemo, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Badge, { type BadgeVariant } from '../../components/Badge';
import type { TableColumn } from '../../components/Table';
import type { WriteOffStatus, WriteOffReason } from './types';

interface UseStockWriteOffsParams {
  writeOffs: any[];
  saving: boolean;
  setSaving: (value: boolean) => void;
  showNotice: (tone: 'success' | 'error', message: string) => void;
  load: () => Promise<void>;
}

// The "Списания" tab.
export function useStockWriteOffs({ writeOffs, saving, setSaving, showNotice, load }: UseStockWriteOffsParams) {
  const { tr, locale } = useAdminI18n();

  const [selectedWriteOffId, setSelectedWriteOffId] = useState<string | null>(null);
  const [showCreateWriteOff, setShowCreateWriteOff] = useState(false);
  const [woReason, setWoReason] = useState<WriteOffReason>('OTHER');
  const [woPurchaseOrderId, setWoPurchaseOrderId] = useState('');
  const [woNote, setWoNote] = useState('');
  const [woItems, setWoItems] = useState([{ productId: '', qty: 1, unitCost: 0 }]);

  const writeOffStatusLabel: Record<WriteOffStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  const writeOffReasonLabel: Record<WriteOffReason, string> = {
    DEFECT: tr('Брак', 'Nuqsonli'),
    DAMAGE: tr('Порча', 'Shikastlangan'),
    SHORTAGE: tr('Недостача', 'Yetishmovchilik'),
    INTERNAL_USE: tr('Собственные нужды', "O'z ehtiyoji"),
    OTHER: tr('Другое', 'Boshqa'),
  };

  function writeOffStatusBadgeVariant(status: WriteOffStatus): BadgeVariant {
    if (status === 'CONFIRMED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    return 'neutral';
  }

  const selectedWriteOff = writeOffs.find((w: any) => w.id === selectedWriteOffId) ?? null;

  const writeOffColumns: TableColumn<any>[] = [
    {
      key: 'wo',
      header: 'WO#',
      render: (w) => (
        <span className="font-semibold text-neutral-800 inline-flex items-center gap-1.5">
          <span className={`transition-transform ${w.id === selectedWriteOffId ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
          WO-{w.writeOffNumber}
        </span>
      ),
    },
    { key: 'reason', header: tr('Причина', 'Sababi'), render: (w) => writeOffReasonLabel[w.reason as WriteOffReason] || w.reason },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (w) => <Badge variant={writeOffStatusBadgeVariant(w.status)}>{writeOffStatusLabel[w.status as WriteOffStatus] || w.status}</Badge>,
    },
    {
      key: 'total',
      header: tr('Сумма', 'Summa'),
      render: (w) => <span className="font-semibold text-neutral-800">{Number(w.totalCost).toLocaleString(locale)}</span>,
    },
    { key: 'date', header: tr('Дата', 'Sana'), render: (w) => new Date(w.createdAt).toLocaleDateString(locale) },
  ];

  function resetCreateWriteOffForm() {
    setWoReason('OTHER'); setWoPurchaseOrderId(''); setWoNote('');
    setWoItems([{ productId: '', qty: 1, unitCost: 0 }]);
    setShowCreateWriteOff(false);
  }

  function addWriteOffItem() {
    setWoItems((prev) => [...prev, { productId: '', qty: 1, unitCost: 0 }]);
  }

  function removeWriteOffItem(idx: number) {
    setWoItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateWriteOffItem(idx: number, field: string, value: string | number) {
    setWoItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const writeOffCreateTotal = useMemo(
    () => woItems.reduce((sum, item) => sum + (item.qty || 0) * (item.unitCost || 0), 0),
    [woItems]
  );

  async function submitCreateWriteOff() {
    if (woItems.some((i) => !i.productId || !i.qty)) {
      showNotice('error', tr('Заполните все обязательные поля', "Barcha maydonlarni to'ldiring"));
      return;
    }
    setSaving(true);
    try {
      await adminApi.createStockWriteOff({
        reason: woReason,
        purchaseOrderId: woPurchaseOrderId || undefined,
        note: woNote.trim() || undefined,
        items: woItems.map((i) => ({ productId: i.productId, qty: Number(i.qty), unitCost: Number(i.unitCost) })),
      });
      resetCreateWriteOffForm();
      await load();
      showNotice('success', tr('Списание создано', 'Hisobdan chiqarish yaratildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка создания', 'Yaratish xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelWriteOff(id: string) {
    setSaving(true);
    try {
      await adminApi.updateStockWriteOff(id, { status: 'CANCELLED' });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmWriteOff(id: string) {
    setSaving(true);
    try {
      await adminApi.confirmStockWriteOff(id);
      await load();
      showNotice('success', tr('Списание подтверждено, остатки обновлены', 'Hisobdan chiqarish tasdiqlandi, qoldiqlar yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка подтверждения', 'Tasdiqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function addWriteOffItemToServer(id: string, data: { productId: string; qty: number; unitCost: number }) {
    setSaving(true);
    try {
      await adminApi.addStockWriteOffItem(id, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function updateWriteOffItemOnServer(id: string, itemId: string, data: { qty?: number; unitCost?: number }) {
    setSaving(true);
    try {
      await adminApi.updateStockWriteOffItem(id, itemId, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removeWriteOffItemOnServer(id: string, itemId: string) {
    setSaving(true);
    try {
      await adminApi.deleteStockWriteOffItem(id, itemId);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  return {
    selectedWriteOffId, setSelectedWriteOffId, selectedWriteOff,
    showCreateWriteOff, setShowCreateWriteOff,
    woReason, setWoReason, woPurchaseOrderId, setWoPurchaseOrderId, woNote, setWoNote,
    woItems, addWriteOffItem, removeWriteOffItem, updateWriteOffItem, writeOffCreateTotal,
    writeOffColumns,
    resetCreateWriteOffForm, submitCreateWriteOff, cancelWriteOff, confirmWriteOff,
    addWriteOffItemToServer, updateWriteOffItemOnServer, removeWriteOffItemOnServer,
  };
}
