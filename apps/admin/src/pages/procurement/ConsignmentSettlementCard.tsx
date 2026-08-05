import React, { useMemo, useState } from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Badge, { type BadgeVariant } from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import type { ConsignmentSettlementStatus } from './types';

interface ConsignmentSettlementCardProps {
  settlement: any;
  saving: boolean;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
  canEdit: boolean;
  onUpdateItem: (itemId: string, qtySold: number) => void;
}

const STATUS_BADGE: Record<ConsignmentSettlementStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

export default function ConsignmentSettlementCard({
  settlement, saving, onCancel, onConfirm, canEdit, onUpdateItem,
}: ConsignmentSettlementCardProps) {
  const { tr, locale } = useAdminI18n();
  const status = settlement.status as ConsignmentSettlementStatus;
  const items = settlement.items || [];
  const currency = settlement.purchaseOrder?.currency || '';

  const statusLabel: Record<ConsignmentSettlementStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function draftValue(item: any) {
    if (item.id in drafts) return drafts[item.id];
    return String(item.qtySold ?? 0);
  }

  function commit(item: any) {
    const raw = draftValue(item);
    const next = raw === '' ? 0 : Number(raw);
    if (Number.isNaN(next) || next < 0) return;
    if (next !== item.qtySold) onUpdateItem(item.id, next);
  }

  const totalPlannedDebt = useMemo(
    () => items.reduce((sum: number, item: any) => sum + (item.qtySold || 0) * Number(item.unitCost), 0),
    [items]
  );

  const columns: TableColumn<any>[] = [
    { key: 'product', header: tr('Товар', 'Mahsulot'), render: (item) => item.purchaseOrderItem?.product?.name || item.purchaseOrderItemId },
    { key: 'received', header: tr('Получено', 'Qabul qilindi'), render: (item) => item.purchaseOrderItem?.qtyReceived ?? '—' },
    { key: 'remaining', header: tr('Остаток нереализ.', 'Realizatsiya qilinmagan'), render: (item) => item.remaining ?? '—' },
    {
      key: 'qtySold',
      header: tr('Продано', 'Sotildi'),
      render: (item) => canEdit ? (
        <Input
          type="number"
          min={0}
          max={item.remaining}
          value={draftValue(item)}
          onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
          onBlur={() => commit(item)}
        />
      ) : item.qtySold,
    },
    {
      key: 'debt',
      header: tr('Долг', 'Qarz'),
      render: (item) => <span>{((item.qtySold || 0) * Number(item.unitCost)).toLocaleString(locale)} {currency}</span>,
    },
  ];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold text-token-base text-neutral-800">CS-{settlement.settlementNumber}</span>
            <Badge variant={STATUS_BADGE[status]}>{statusLabel[status]}</Badge>
            <span className="text-token-xs text-neutral-500">{new Date(settlement.createdAt).toLocaleDateString(locale)}</span>
          </div>
          {settlement.purchaseOrder && (
            <p className="mt-1 mb-0 text-token-sm text-neutral-600">
              PO-{settlement.purchaseOrder.poNumber} · {settlement.purchaseOrder.supplierName}
            </p>
          )}
          {settlement.note && <p className="mt-0.5 mb-0 text-token-xs text-neutral-500">{settlement.note}</p>}
        </div>
        {status === 'DRAFT' && (
          <div className="flex gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" type="button" className="text-danger" disabled={saving} onClick={() => onCancel(settlement.id)}>
              {tr('Отменить', 'Bekor qilish')}
            </Button>
            <Button variant="primary" size="sm" type="button" disabled={saving} onClick={() => onConfirm(settlement.id)}>
              {tr('Подтвердить', 'Tasdiqlash')}
            </Button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-3">
          <Table columns={columns} data={items} rowKey={(item) => item.id} />
        </div>
      )}

      <div className="mt-2.5 text-token-xs text-neutral-500">
        {status === 'DRAFT'
          ? <>{tr('Ожидаемый долг', 'Kutilayotgan qarz')}: {totalPlannedDebt.toLocaleString(locale)} {currency}</>
          : <>{tr('Начислено долга поставщику', "Ta'minotchiga hisoblangan qarz")}: {Number(settlement.totalDebtCharged).toLocaleString(locale)} UZS</>}
      </div>
    </Card>
  );
}
