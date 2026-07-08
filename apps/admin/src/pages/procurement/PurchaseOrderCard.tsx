import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge, { type BadgeVariant } from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import type { POStatus } from './types';

interface PurchaseOrderCardProps {
  po: any;
  transitions: POStatus[];
  canReceive: boolean;
  statusLabel: Record<POStatus, string>;
  statusBadgeVariant: (status: POStatus) => BadgeVariant;
  saving: boolean;
  onTransition: (poId: string, status: POStatus) => void;
  onReceive: (po: any) => void;
}

export default function PurchaseOrderCard({
  po, transitions, canReceive, statusLabel, statusBadgeVariant, saving, onTransition, onReceive,
}: PurchaseOrderCardProps) {
  const { tr, locale } = useAdminI18n();
  const status = po.status as POStatus;

  const columns: TableColumn<any>[] = [
    { key: 'product', header: tr('Товар', 'Mahsulot'), render: (item) => item.product?.name || item.productId },
    { key: 'qty', header: tr('Заказ', 'Buyurtma'), render: (item) => item.qty },
    { key: 'received', header: tr('Принято', 'Qabul'), render: (item) => item.qtyReceived ?? 0 },
    { key: 'unitCost', header: tr('Цена', 'Narx'), render: (item) => Number(item.unitCost).toLocaleString(locale) },
    { key: 'totalCost', header: tr('Сумма', 'Summa'), render: (item) => Number(item.totalCost).toLocaleString(locale) },
  ];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold text-token-base text-neutral-800">PO-{po.poNumber}</span>
            <Badge variant={statusBadgeVariant(status)}>{statusLabel[status] || status}</Badge>
            <span className="text-token-xs text-neutral-500">{new Date(po.createdAt).toLocaleDateString(locale)}</span>
          </div>
          <p className="mt-1 mb-0 text-token-sm text-neutral-600">
            {po.supplierName} · {po.currency}
            {po.fxRate ? ` · ${po.fxRate} UZS/${po.currency}` : ''}
            {po.note ? ` · ${po.note}` : ''}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {transitions.map((next) => (
            <Button
              key={next}
              variant="ghost"
              size="sm"
              type="button"
              className={next === 'CANCELLED' ? 'text-danger' : undefined}
              disabled={saving}
              onClick={() => onTransition(po.id, next)}
            >
              {statusLabel[next]}
            </Button>
          ))}
          {canReceive && (
            <Button variant="primary" size="sm" type="button" disabled={saving} onClick={() => onReceive(po)}>
              {tr('Принять', 'Qabul qilish')}
            </Button>
          )}
        </div>
      </div>

      {(po.items || []).length > 0 && (
        <div className="mt-3">
          <Table columns={columns} data={po.items} rowKey={(item) => item.id} />
        </div>
      )}

      <div className="mt-2.5 flex gap-4 flex-wrap text-token-xs text-neutral-500">
        <span>{tr('Товары', 'Mahsulotlar')}: {Number(po.totalCost).toLocaleString(locale)}</span>
        {Number(po.shippingCost) > 0 && <span>{tr('Доставка', 'Yetkazib berish')}: {Number(po.shippingCost).toLocaleString(locale)}</span>}
        {Number(po.customsCost) > 0 && <span>{tr('Таможня', 'Bojxona')}: {Number(po.customsCost).toLocaleString(locale)}</span>}
      </div>
    </Card>
  );
}
