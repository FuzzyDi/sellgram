import { useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Badge, { type BadgeVariant } from '../../components/Badge';
import type { TableColumn } from '../../components/Table';
import type { StockCountStatus } from './types';

interface UseStockCountsParams {
  stockCounts: any[];
  saving: boolean;
  setSaving: (value: boolean) => void;
  showNotice: (tone: 'success' | 'error', message: string) => void;
  load: () => Promise<void>;
}

// The "Инвентаризация" tab.
export function useStockCounts({ stockCounts, saving, setSaving, showNotice, load }: UseStockCountsParams) {
  const { tr, locale } = useAdminI18n();

  const [selectedStockCountId, setSelectedStockCountId] = useState<string | null>(null);
  const [showCreateStockCount, setShowCreateStockCount] = useState(false);
  const [scNote, setScNote] = useState('');

  const stockCountStatusLabel: Record<StockCountStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  function stockCountStatusBadgeVariant(status: StockCountStatus): BadgeVariant {
    if (status === 'CONFIRMED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    return 'neutral';
  }

  const selectedStockCount = stockCounts.find((c: any) => c.id === selectedStockCountId) ?? null;

  const stockCountColumns: TableColumn<any>[] = [
    {
      key: 'sc',
      header: 'SC#',
      render: (c) => (
        <span className="font-semibold text-neutral-800 inline-flex items-center gap-1.5">
          <span className={`transition-transform ${c.id === selectedStockCountId ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
          SC-{c.countNumber}
        </span>
      ),
    },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (c) => <Badge variant={stockCountStatusBadgeVariant(c.status)}>{stockCountStatusLabel[c.status as StockCountStatus] || c.status}</Badge>,
    },
    { key: 'items', header: tr('Позиций', 'Pozitsiyalar'), render: (c) => (c.items || []).length },
    { key: 'date', header: tr('Дата', 'Sana'), render: (c) => new Date(c.createdAt).toLocaleDateString(locale) },
  ];

  function resetCreateStockCountForm() {
    setScNote('');
    setShowCreateStockCount(false);
  }

  async function submitCreateStockCount() {
    setSaving(true);
    try {
      await adminApi.createStockCount({ note: scNote.trim() || undefined });
      resetCreateStockCountForm();
      await load();
      showNotice('success', tr('Инвентаризация начата', 'Inventarizatsiya boshlandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка создания', 'Yaratish xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelStockCount(id: string) {
    setSaving(true);
    try {
      await adminApi.updateStockCount(id, { status: 'CANCELLED' });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmStockCount(id: string) {
    setSaving(true);
    try {
      await adminApi.confirmStockCount(id);
      await load();
      showNotice('success', tr('Инвентаризация подтверждена, расхождения применены', 'Inventarizatsiya tasdiqlandi, farqlar qo\'llanildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка подтверждения', 'Tasdiqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function updateStockCountItemOnServer(id: string, itemId: string, countedQty: number | null) {
    try {
      await adminApi.updateStockCountItem(id, itemId, { countedQty });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    }
  }

  return {
    selectedStockCountId, setSelectedStockCountId, selectedStockCount,
    showCreateStockCount, setShowCreateStockCount,
    scNote, setScNote,
    stockCountColumns,
    resetCreateStockCountForm, submitCreateStockCount, cancelStockCount, confirmStockCount,
    updateStockCountItemOnServer,
  };
}
