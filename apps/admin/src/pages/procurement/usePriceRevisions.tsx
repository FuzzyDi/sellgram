import { useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Badge, { type BadgeVariant } from '../../components/Badge';
import type { TableColumn } from '../../components/Table';
import type { PriceRevisionItemDraft } from './CreatePriceRevisionForm';
import type { PriceRevisionStatus } from './types';

interface UsePriceRevisionsParams {
  priceRevisions: any[];
  saving: boolean;
  setSaving: (value: boolean) => void;
  showNotice: (tone: 'success' | 'error', message: string) => void;
  load: () => Promise<void>;
}

// The "Переоценка" tab.
export function usePriceRevisions({ priceRevisions, saving, setSaving, showNotice, load }: UsePriceRevisionsParams) {
  const { tr, locale } = useAdminI18n();

  const [selectedPriceRevisionId, setSelectedPriceRevisionId] = useState<string | null>(null);
  const [showCreatePriceRevision, setShowCreatePriceRevision] = useState(false);
  const [prNote, setPrNote] = useState('');
  const [prItems, setPrItems] = useState<PriceRevisionItemDraft[]>([{ productId: '', newPrice: '', newPosPrice: '', newWholesalePrice: '' }]);

  const priceRevisionStatusLabel: Record<PriceRevisionStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  function priceRevisionStatusBadgeVariant(status: PriceRevisionStatus): BadgeVariant {
    if (status === 'CONFIRMED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    return 'neutral';
  }

  const selectedPriceRevision = priceRevisions.find((r: any) => r.id === selectedPriceRevisionId) ?? null;

  const priceRevisionColumns: TableColumn<any>[] = [
    {
      key: 'prc',
      header: 'PRC#',
      render: (r) => (
        <span className="font-semibold text-neutral-800 inline-flex items-center gap-1.5">
          <span className={`transition-transform ${r.id === selectedPriceRevisionId ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
          PRC-{r.revisionNumber}
        </span>
      ),
    },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (r) => <Badge variant={priceRevisionStatusBadgeVariant(r.status)}>{priceRevisionStatusLabel[r.status as PriceRevisionStatus] || r.status}</Badge>,
    },
    { key: 'items', header: tr('Позиций', 'Pozitsiyalar'), render: (r) => (r.items || []).length },
    { key: 'date', header: tr('Дата', 'Sana'), render: (r) => new Date(r.createdAt).toLocaleDateString(locale) },
  ];

  function resetCreatePriceRevisionForm() {
    setPrNote('');
    setPrItems([{ productId: '', newPrice: '', newPosPrice: '', newWholesalePrice: '' }]);
    setShowCreatePriceRevision(false);
  }

  function addPriceRevisionItem() {
    setPrItems((prev) => [...prev, { productId: '', newPrice: '', newPosPrice: '', newWholesalePrice: '' }]);
  }

  function removePriceRevisionItem(idx: number) {
    setPrItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updatePriceRevisionItem(idx: number, field: keyof PriceRevisionItemDraft, value: string) {
    setPrItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function submitCreatePriceRevision() {
    const items = prItems
      .filter((i) => i.productId && (i.newPrice || i.newPosPrice || i.newWholesalePrice))
      .map((i) => ({
        productId: i.productId,
        newPrice: i.newPrice ? Number(i.newPrice) : undefined,
        newPosPrice: i.newPosPrice ? Number(i.newPosPrice) : undefined,
        newWholesalePrice: i.newWholesalePrice ? Number(i.newWholesalePrice) : undefined,
      }));
    if (items.length === 0) {
      showNotice('error', tr('Добавьте хотя бы один товар с новой ценой', "Kamida bitta yangi narxli mahsulot qo'shing"));
      return;
    }
    setSaving(true);
    try {
      await adminApi.createPriceRevision({ note: prNote.trim() || undefined, items });
      resetCreatePriceRevisionForm();
      await load();
      showNotice('success', tr('Переоценка создана', "Qayta baholash yaratildi"));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка создания', 'Yaratish xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelPriceRevision(id: string) {
    setSaving(true);
    try {
      await adminApi.updatePriceRevision(id, { status: 'CANCELLED' });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmPriceRevision(id: string) {
    setSaving(true);
    try {
      await adminApi.confirmPriceRevision(id);
      await load();
      showNotice('success', tr('Переоценка подтверждена, цены обновлены', "Qayta baholash tasdiqlandi, narxlar yangilandi"));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка подтверждения', 'Tasdiqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function addPriceRevisionItemToServer(id: string, data: { productId: string; newPrice?: number; newPosPrice?: number; newWholesalePrice?: number }) {
    setSaving(true);
    try {
      await adminApi.addPriceRevisionItem(id, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function updatePriceRevisionItemOnServer(id: string, itemId: string, data: { newPrice?: number | null; newPosPrice?: number | null; newWholesalePrice?: number | null }) {
    setSaving(true);
    try {
      await adminApi.updatePriceRevisionItem(id, itemId, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removePriceRevisionItemOnServer(id: string, itemId: string) {
    setSaving(true);
    try {
      await adminApi.deletePriceRevisionItem(id, itemId);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  return {
    selectedPriceRevisionId, setSelectedPriceRevisionId, selectedPriceRevision,
    showCreatePriceRevision, setShowCreatePriceRevision,
    prNote, setPrNote,
    prItems, addPriceRevisionItem, removePriceRevisionItem, updatePriceRevisionItem,
    priceRevisionColumns,
    resetCreatePriceRevisionForm, submitCreatePriceRevision, cancelPriceRevision, confirmPriceRevision,
    addPriceRevisionItemToServer, updatePriceRevisionItemOnServer, removePriceRevisionItemOnServer,
  };
}
