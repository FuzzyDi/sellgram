import React, { useMemo, useState } from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Badge, { type BadgeVariant } from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import type { StockCountStatus } from './types';

interface StockCountCardProps {
  count: any;
  saving: boolean;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
  canEdit: boolean;
  onUpdateItem: (itemId: string, countedQty: number | null) => void;
}

const STATUS_BADGE: Record<StockCountStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

export default function StockCountCard({ count, saving, onCancel, onConfirm, canEdit, onUpdateItem }: StockCountCardProps) {
  const { tr, locale } = useAdminI18n();
  const status = count.status as StockCountStatus;
  const items = count.items || [];

  const statusLabel: Record<StockCountStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  // Local draft values so typing doesn't fire a request per keystroke —
  // committed to the server onBlur, only when the value actually changed.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function draftValue(item: any) {
    if (item.id in drafts) return drafts[item.id];
    return item.countedQty === null || item.countedQty === undefined ? '' : String(item.countedQty);
  }

  function commit(item: any) {
    const raw = draftValue(item);
    const next = raw === '' ? null : Number(raw);
    const current = item.countedQty ?? null;
    if (next !== current && !(next !== null && Number.isNaN(next))) {
      onUpdateItem(item.id, next);
    }
  }

  const { countedCount, discrepancyCount } = useMemo(() => {
    let counted = 0;
    let discrepancy = 0;
    for (const item of items) {
      if (item.countedQty !== null && item.countedQty !== undefined) {
        counted += 1;
        if (item.countedQty !== item.expectedQty) discrepancy += 1;
      }
    }
    return { countedCount: counted, discrepancyCount: discrepancy };
  }, [items]);

  const columns: TableColumn<any>[] = [
    { key: 'product', header: tr('Товар', 'Mahsulot'), render: (item) => item.product?.name || item.productId },
    { key: 'expected', header: tr('Ожидается', 'Kutilmoqda'), render: (item) => item.expectedQty },
    {
      key: 'counted',
      header: tr('Посчитано', 'Hisoblandi'),
      render: (item) => canEdit ? (
        <Input
          type="number"
          min={0}
          value={draftValue(item)}
          placeholder={tr('—', '—')}
          onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
          onBlur={() => commit(item)}
        />
      ) : (item.countedQty ?? '—'),
    },
    {
      key: 'delta',
      header: tr('Разница', 'Farq'),
      render: (item) => {
        if (item.countedQty === null || item.countedQty === undefined) return <span className="text-neutral-400">—</span>;
        const delta = item.countedQty - item.expectedQty;
        if (delta === 0) return <span className="text-neutral-500">0</span>;
        return <span className={delta > 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>{delta > 0 ? `+${delta}` : delta}</span>;
      },
    },
  ];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold text-token-base text-neutral-800">SC-{count.countNumber}</span>
            <Badge variant={STATUS_BADGE[status]}>{statusLabel[status]}</Badge>
            <span className="text-token-xs text-neutral-500">{new Date(count.createdAt).toLocaleDateString(locale)}</span>
          </div>
          {status === 'DRAFT' && (
            <p className="mt-1 mb-0 text-token-xs text-neutral-500">
              {tr('Посчитано', 'Hisoblandi')}: {countedCount} / {items.length}
              {discrepancyCount > 0 ? ` · ${tr('расхождений', 'farqlar')}: ${discrepancyCount}` : ''}
            </p>
          )}
          {count.note && <p className="mt-0.5 mb-0 text-token-xs text-neutral-500">{count.note}</p>}
        </div>
        {status === 'DRAFT' && (
          <div className="flex gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" type="button" className="text-danger" disabled={saving} onClick={() => onCancel(count.id)}>
              {tr('Отменить', 'Bekor qilish')}
            </Button>
            <Button variant="primary" size="sm" type="button" disabled={saving} onClick={() => onConfirm(count.id)}>
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
    </Card>
  );
}
