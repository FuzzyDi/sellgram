import React, { useState } from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge, { type BadgeVariant } from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import type { CustomerReturnStatus } from './types';

interface CustomerReturnCardProps {
  ret: any;
  saving: boolean;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
  products: any[];
  canEditItems: boolean;
  onAddItem: (data: { productId: string; qty: number; unitCost: number }) => void;
  onUpdateItem: (itemId: string, data: { qty?: number; unitCost?: number }) => void;
  onRemoveItem: (itemId: string) => void;
}

const STATUS_BADGE: Record<CustomerReturnStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

export default function CustomerReturnCard({
  ret, saving, onCancel, onConfirm, products, canEditItems, onAddItem, onUpdateItem, onRemoveItem,
}: CustomerReturnCardProps) {
  const { tr, locale } = useAdminI18n();
  const status = ret.status as CustomerReturnStatus;
  const items = ret.items || [];

  const statusLabel: Record<CustomerReturnStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState('');
  const [draftUnitCost, setDraftUnitCost] = useState('');

  const [newProductId, setNewProductId] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newUnitCost, setNewUnitCost] = useState('0');

  function startEdit(item: any) {
    setEditingItemId(item.id);
    setDraftQty(String(item.qty));
    setDraftUnitCost(String(item.unitCost));
  }

  function saveEdit(itemId: string) {
    onUpdateItem(itemId, { qty: Number(draftQty), unitCost: Number(draftUnitCost) });
    setEditingItemId(null);
  }

  function submitAddItem() {
    if (!newProductId || !newQty) return;
    onAddItem({ productId: newProductId, qty: Number(newQty), unitCost: Number(newUnitCost) });
    setNewProductId(''); setNewQty('1'); setNewUnitCost('0');
  }

  const columns: TableColumn<any>[] = [
    { key: 'product', header: tr('Товар', 'Mahsulot'), render: (item) => item.product?.name || item.productId },
    {
      key: 'qty',
      header: tr('Количество', 'Miqdor'),
      render: (item) => editingItemId === item.id
        ? <Input type="number" min={1} value={draftQty} onChange={(e) => setDraftQty(e.target.value)} />
        : item.qty,
    },
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
          <Button variant="ghost" size="sm" type="button" disabled={saving} onClick={() => setEditingItemId(null)}>✕</Button>
        </div>
      ) : (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" type="button" disabled={saving} onClick={() => startEdit(item)}>{tr('Изменить', 'Tahrirlash')}</Button>
          <Button variant="danger" size="sm" type="button" disabled={saving || items.length <= 1} onClick={() => onRemoveItem(item.id)}>
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
            <span className="font-semibold text-token-base text-neutral-800">CR-{ret.returnNumber}</span>
            <Badge variant={STATUS_BADGE[status]}>{statusLabel[status]}</Badge>
            <span className="text-token-xs text-neutral-500">{new Date(ret.createdAt).toLocaleDateString(locale)}</span>
          </div>
          <p className="mt-1 mb-0 text-token-sm text-neutral-600">
            {ret.counterparty?.name || tr('Без привязки к клиенту', "Mijozga bog'lanmagan")}
          </p>
          {ret.note && <p className="mt-0.5 mb-0 text-token-xs text-neutral-500">{ret.note}</p>}
        </div>
        {status === 'DRAFT' && (
          <div className="flex gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" type="button" className="text-danger" disabled={saving} onClick={() => onCancel(ret.id)}>
              {tr('Отменить', 'Bekor qilish')}
            </Button>
            <Button variant="primary" size="sm" type="button" disabled={saving} onClick={() => onConfirm(ret.id)}>
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

      <div className="mt-2.5 text-token-xs text-neutral-500">
        {tr('Сумма возврата', 'Qaytarish summasi')}: {Number(ret.totalCost).toLocaleString(locale)}
        {ret.counterparty ? ` · ${tr('долг клиента уменьшен', 'mijoz qarzi kamaydi')}` : ''}
      </div>
    </Card>
  );
}
