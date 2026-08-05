import React, { useState } from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
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
  products: any[];
  canEditItems: boolean;
  onAddItem: (data: { productId: string; qty: number; unitCost: number }) => void;
  onUpdateItem: (itemId: string, data: { qty?: number; unitCost?: number }) => void;
  onRemoveItem: (itemId: string) => void;
  canEditReceivedNote: boolean;
  onSaveNote: (note: string) => void;
}

export default function PurchaseOrderCard({
  po, transitions, canReceive, statusLabel, statusBadgeVariant, saving, onTransition, onReceive,
  products, canEditItems, onAddItem, onUpdateItem, onRemoveItem, canEditReceivedNote, onSaveNote,
}: PurchaseOrderCardProps) {
  const { tr, locale } = useAdminI18n();
  const status = po.status as POStatus;
  const items = po.items || [];

  const paymentMethodLabel: Record<string, string> = {
    CASH: tr('Наличные', 'Naqd'),
    NON_CASH: tr('Безналичный', 'Naqd emas'),
    CREDIT: tr('В долг', 'Qarzga'),
  };

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState('');
  const [draftUnitCost, setDraftUnitCost] = useState('');

  const [newProductId, setNewProductId] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newUnitCost, setNewUnitCost] = useState('0');

  const noteEditable = status !== 'RECEIVED' || canEditReceivedNote;
  // Parent renders this with key={po.id}, so switching documents remounts
  // the component and re-initializes this from the new po — no effect
  // needed to keep it in sync.
  const [noteDraft, setNoteDraft] = useState(po.note || '');

  function startEdit(item: any) {
    setEditingItemId(item.id);
    setDraftQty(String(item.qty));
    setDraftUnitCost(String(item.unitCost));
  }

  function cancelEdit() {
    setEditingItemId(null);
  }

  function saveEdit(itemId: string) {
    onUpdateItem(itemId, { qty: Number(draftQty), unitCost: Number(draftUnitCost) });
    setEditingItemId(null);
  }

  function submitAddItem() {
    if (!newProductId || !newQty || !newUnitCost) return;
    onAddItem({ productId: newProductId, qty: Number(newQty), unitCost: Number(newUnitCost) });
    setNewProductId(''); setNewQty('1'); setNewUnitCost('0');
  }

  const columns: TableColumn<any>[] = [
    { key: 'product', header: tr('Товар', 'Mahsulot'), render: (item) => item.product?.name || item.productId },
    {
      key: 'qty',
      header: tr('Заказ', 'Buyurtma'),
      render: (item) => editingItemId === item.id
        ? <Input type="number" min={1} value={draftQty} onChange={(e) => setDraftQty(e.target.value)} />
        : item.qty,
    },
    { key: 'received', header: tr('Принято', 'Qabul'), render: (item) => item.qtyReceived ?? 0 },
    {
      key: 'unitCost',
      header: tr('Цена', 'Narx'),
      render: (item) => editingItemId === item.id
        ? <Input type="number" min={0} value={draftUnitCost} onChange={(e) => setDraftUnitCost(e.target.value)} />
        : Number(item.unitCost).toLocaleString(locale),
    },
    { key: 'totalCost', header: tr('Сумма', 'Summa'), render: (item) => Number(item.totalCost).toLocaleString(locale) },
    ...(canEditItems ? [{
      key: 'actions',
      header: '',
      render: (item: any) => editingItemId === item.id ? (
        <div className="flex gap-1">
          <Button variant="primary" size="sm" type="button" disabled={saving} onClick={() => saveEdit(item.id)}>✓</Button>
          <Button variant="ghost" size="sm" type="button" disabled={saving} onClick={cancelEdit}>✕</Button>
        </div>
      ) : (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" type="button" disabled={saving} onClick={() => startEdit(item)}>{tr('Изменить', 'Tahrirlash')}</Button>
          <Button
            variant="danger" size="sm" type="button"
            disabled={saving || items.length <= 1}
            onClick={() => onRemoveItem(item.id)}
          >
            {tr('Удалить', "O'chirish")}
          </Button>
        </div>
      ),
    } as TableColumn<any>] : []),
  ];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold text-token-base text-neutral-800">PO-{po.poNumber}</span>
            <Badge variant={statusBadgeVariant(status)}>{statusLabel[status] || status}</Badge>
            {po.paymentMethod && (
              <Badge variant={po.paymentMethod === 'CREDIT' ? 'warning' : 'neutral'}>
                {paymentMethodLabel[po.paymentMethod] || po.paymentMethod}
              </Badge>
            )}
            <span className="text-token-xs text-neutral-500">{new Date(po.createdAt).toLocaleDateString(locale)}</span>
          </div>
          <p className="mt-1 mb-0 text-token-sm text-neutral-600">
            {po.supplierName} · {po.currency}
            {po.fxRate ? ` · ${po.fxRate} UZS/${po.currency}` : ''}
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

      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-token-xs text-neutral-500">{tr('Заметка', 'Eslatma')}:</span>
        {noteEditable ? (
          <>
            <div className="min-w-[240px] flex-1">
              <Input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={tr('Без заметки', 'Eslatmasiz')}
              />
            </div>
            {noteDraft !== (po.note || '') && (
              <Button variant="ghost" size="sm" type="button" disabled={saving} onClick={() => onSaveNote(noteDraft)}>
                {tr('Сохранить', 'Saqlash')}
              </Button>
            )}
          </>
        ) : (
          <span className="text-token-sm text-neutral-600">{po.note || tr('Без заметки', 'Eslatmasiz')}</span>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-3">
          <Table columns={columns} data={items} rowKey={(item) => item.id} />
        </div>
      )}

      {canEditItems && (
        <div className="mt-2.5 flex gap-2 items-end flex-wrap">
          <div className="min-w-[200px] flex-1">
            <Select value={newProductId} onChange={(e) => setNewProductId(e.target.value)}>
              <option value="">{tr('— выберите товар —', '— mahsulot tanlang —')}</option>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="w-24">
            <Input type="number" min={1} value={newQty} onChange={(e) => setNewQty(e.target.value)} />
          </div>
          <div className="w-32">
            <Input type="number" min={0} value={newUnitCost} onChange={(e) => setNewUnitCost(e.target.value)} />
          </div>
          <Button variant="ghost" size="sm" type="button" disabled={saving || !newProductId} onClick={submitAddItem}>
            + {tr('Добавить товар', "Mahsulot qo'shish")}
          </Button>
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
