import { useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Badge, { type BadgeVariant } from '../../components/Badge';
import type { TableColumn } from '../../components/Table';
import type { ConsignmentSettlementStatus } from './types';

interface UseConsignmentSettlementsParams {
  pos: any[];
  consignmentSettlements: any[];
  saving: boolean;
  setSaving: (value: boolean) => void;
  showNotice: (tone: 'success' | 'error', message: string) => void;
  load: () => Promise<void>;
}

// The "Реализация" tab.
export function useConsignmentSettlements({ pos, consignmentSettlements, saving, setSaving, showNotice, load }: UseConsignmentSettlementsParams) {
  const { tr, locale } = useAdminI18n();

  const [selectedConsignmentSettlementId, setSelectedConsignmentSettlementId] = useState<string | null>(null);
  const [showCreateConsignmentSettlement, setShowCreateConsignmentSettlement] = useState(false);
  const [csPurchaseOrderId, setCsPurchaseOrderId] = useState('');
  const [csNote, setCsNote] = useState('');

  const consignmentSettlementStatusLabel: Record<ConsignmentSettlementStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  function consignmentSettlementStatusBadgeVariant(status: ConsignmentSettlementStatus): BadgeVariant {
    if (status === 'CONFIRMED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    return 'neutral';
  }

  const eligibleConsignmentPurchaseOrders = pos.filter((po: any) => po.paymentMethod === 'CONSIGNMENT' && po.status === 'RECEIVED');

  const selectedConsignmentSettlement = consignmentSettlements.find((s: any) => s.id === selectedConsignmentSettlementId) ?? null;

  const consignmentSettlementColumns: TableColumn<any>[] = [
    {
      key: 'cs',
      header: 'CS#',
      render: (s) => (
        <span className="font-semibold text-neutral-800 inline-flex items-center gap-1.5">
          <span className={`transition-transform ${s.id === selectedConsignmentSettlementId ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
          CS-{s.settlementNumber}
        </span>
      ),
    },
    { key: 'po', header: 'PO', render: (s) => s.purchaseOrder ? `PO-${s.purchaseOrder.poNumber}` : '—' },
    { key: 'supplier', header: tr('Поставщик', 'Yetkazib beruvchi'), render: (s) => s.purchaseOrder?.supplierName || '—' },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (s) => <Badge variant={consignmentSettlementStatusBadgeVariant(s.status)}>{consignmentSettlementStatusLabel[s.status as ConsignmentSettlementStatus] || s.status}</Badge>,
    },
    {
      key: 'debt',
      header: tr('Долг (UZS)', 'Qarz (UZS)'),
      render: (s) => <span className="font-semibold text-neutral-800">{Number(s.totalDebtCharged).toLocaleString(locale)}</span>,
    },
    { key: 'date', header: tr('Дата', 'Sana'), render: (s) => new Date(s.createdAt).toLocaleDateString(locale) },
  ];

  function resetCreateConsignmentSettlementForm() {
    setCsPurchaseOrderId(''); setCsNote('');
    setShowCreateConsignmentSettlement(false);
  }

  async function submitCreateConsignmentSettlement() {
    if (!csPurchaseOrderId) {
      showNotice('error', tr('Выберите приходный документ', 'Kirim hujjatini tanlang'));
      return;
    }
    setSaving(true);
    try {
      await adminApi.createConsignmentSettlement({ purchaseOrderId: csPurchaseOrderId, note: csNote.trim() || undefined });
      resetCreateConsignmentSettlementForm();
      await load();
      showNotice('success', tr('Отчёт создан', 'Hisobot yaratildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка создания', 'Yaratish xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelConsignmentSettlement(id: string) {
    setSaving(true);
    try {
      await adminApi.updateConsignmentSettlement(id, { status: 'CANCELLED' });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmConsignmentSettlement(id: string) {
    setSaving(true);
    try {
      await adminApi.confirmConsignmentSettlement(id);
      await load();
      showNotice('success', tr('Отчёт подтверждён, долг поставщику обновлён', "Hisobot tasdiqlandi, ta'minotchi qarzi yangilandi"));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка подтверждения', 'Tasdiqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function updateConsignmentSettlementItemOnServer(id: string, itemId: string, qtySold: number) {
    try {
      await adminApi.updateConsignmentSettlementItem(id, itemId, { qtySold });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    }
  }

  return {
    selectedConsignmentSettlementId, setSelectedConsignmentSettlementId, selectedConsignmentSettlement,
    showCreateConsignmentSettlement, setShowCreateConsignmentSettlement,
    csPurchaseOrderId, setCsPurchaseOrderId, csNote, setCsNote,
    eligibleConsignmentPurchaseOrders,
    consignmentSettlementColumns,
    resetCreateConsignmentSettlementForm, submitCreateConsignmentSettlement,
    cancelConsignmentSettlement, confirmConsignmentSettlement, updateConsignmentSettlementItemOnServer,
  };
}
