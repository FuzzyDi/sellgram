import React, { useState } from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge, { type BadgeVariant } from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import type { PriceRevisionStatus } from './types';

interface PriceRevisionCardProps {
  revision: any;
  saving: boolean;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
  products: any[];
  canEditItems: boolean;
  onAddItem: (data: { productId: string; newPrice?: number; newPosPrice?: number; newWholesalePrice?: number }) => void;
  onUpdateItem: (itemId: string, data: { newPrice?: number | null; newPosPrice?: number | null; newWholesalePrice?: number | null }) => void;
  onRemoveItem: (itemId: string) => void;
}

const STATUS_BADGE: Record<PriceRevisionStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

function ChangeCell({ oldValue, newValue, locale }: { oldValue: any; newValue: any; locale: string }) {
  if (newValue === null || newValue === undefined) {
    return <span className="text-neutral-400">{Number(oldValue).toLocaleString(locale)}</span>;
  }
  return (
    <span>
      <span className="text-neutral-400 line-through mr-1">{Number(oldValue).toLocaleString(locale)}</span>
      <span className="font-semibold text-success">{Number(newValue).toLocaleString(locale)}</span>
    </span>
  );
}

export default function PriceRevisionCard({
  revision, saving, onCancel, onConfirm, products, canEditItems, onAddItem, onUpdateItem, onRemoveItem,
}: PriceRevisionCardProps) {
  const { tr, locale } = useAdminI18n();
  const status = revision.status as PriceRevisionStatus;
  const items = revision.items || [];

  const statusLabel: Record<PriceRevisionStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState('');
  const [draftPosPrice, setDraftPosPrice] = useState('');
  const [draftWholesalePrice, setDraftWholesalePrice] = useState('');

  const [newProductId, setNewProductId] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newPosPrice, setNewPosPrice] = useState('');
  const [newWholesalePrice, setNewWholesalePrice] = useState('');

  function startEdit(item: any) {
    setEditingItemId(item.id);
    setDraftPrice(item.newPrice ?? '');
    setDraftPosPrice(item.newPosPrice ?? '');
    setDraftWholesalePrice(item.newWholesalePrice ?? '');
  }

  function saveEdit(itemId: string) {
    onUpdateItem(itemId, {
      newPrice: draftPrice === '' ? null : Number(draftPrice),
      newPosPrice: draftPosPrice === '' ? null : Number(draftPosPrice),
      newWholesalePrice: draftWholesalePrice === '' ? null : Number(draftWholesalePrice),
    });
    setEditingItemId(null);
  }

  function submitAddItem() {
    if (!newProductId || (!newPrice && !newPosPrice && !newWholesalePrice)) return;
    onAddItem({
      productId: newProductId,
      newPrice: newPrice ? Number(newPrice) : undefined,
      newPosPrice: newPosPrice ? Number(newPosPrice) : undefined,
      newWholesalePrice: newWholesalePrice ? Number(newWholesalePrice) : undefined,
    });
    setNewProductId(''); setNewPrice(''); setNewPosPrice(''); setNewWholesalePrice('');
  }

  const columns: TableColumn<any>[] = [
    { key: 'product', header: tr('Товар', 'Mahsulot'), render: (item) => item.product?.name || item.productId },
    {
      key: 'price',
      header: tr('Telegram', 'Telegram'),
      render: (item) => editingItemId === item.id
        ? <Input type="number" min={0} value={draftPrice} placeholder={tr('без изменений', "o'zgarishsiz")} onChange={(e) => setDraftPrice(e.target.value)} />
        : <ChangeCell oldValue={item.oldPrice} newValue={item.newPrice} locale={locale} />,
    },
    {
      key: 'posPrice',
      header: 'POS',
      render: (item) => editingItemId === item.id
        ? <Input type="number" min={0} value={draftPosPrice} placeholder={tr('без изменений', "o'zgarishsiz")} onChange={(e) => setDraftPosPrice(e.target.value)} />
        : <ChangeCell oldValue={item.oldPosPrice} newValue={item.newPosPrice} locale={locale} />,
    },
    {
      key: 'wholesalePrice',
      header: tr('Опт', 'Ulgurji'),
      render: (item) => editingItemId === item.id
        ? <Input type="number" min={0} value={draftWholesalePrice} placeholder={tr('без изменений', "o'zgarishsiz")} onChange={(e) => setDraftWholesalePrice(e.target.value)} />
        : <ChangeCell oldValue={item.oldWholesalePrice} newValue={item.newWholesalePrice} locale={locale} />,
    },
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
            <span className="font-semibold text-token-base text-neutral-800">PRC-{revision.revisionNumber}</span>
            <Badge variant={STATUS_BADGE[status]}>{statusLabel[status]}</Badge>
            <span className="text-token-xs text-neutral-500">{new Date(revision.createdAt).toLocaleDateString(locale)}</span>
          </div>
          {revision.note && <p className="mt-0.5 mb-0 text-token-xs text-neutral-500">{revision.note}</p>}
        </div>
        {status === 'DRAFT' && (
          <div className="flex gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" type="button" className="text-danger" disabled={saving} onClick={() => onCancel(revision.id)}>
              {tr('Отменить', 'Bekor qilish')}
            </Button>
            <Button variant="primary" size="sm" type="button" disabled={saving} onClick={() => onConfirm(revision.id)}>
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
          <div className="min-w-[180px] flex-1">
            <Select value={newProductId} onChange={(e) => setNewProductId(e.target.value)}>
              <option value="">{tr('— выберите товар —', '— mahsulot tanlang —')}</option>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="w-28">
            <Input type="number" min={0} value={newPrice} placeholder="Telegram" onChange={(e) => setNewPrice(e.target.value)} />
          </div>
          <div className="w-28">
            <Input type="number" min={0} value={newPosPrice} placeholder="POS" onChange={(e) => setNewPosPrice(e.target.value)} />
          </div>
          <div className="w-28">
            <Input type="number" min={0} value={newWholesalePrice} placeholder={tr('Опт', 'Ulgurji')} onChange={(e) => setNewWholesalePrice(e.target.value)} />
          </div>
          <Button variant="ghost" size="sm" type="button" disabled={saving || !newProductId} onClick={submitAddItem}>
            + {tr('Добавить товар', "Mahsulot qo'shish")}
          </Button>
        </div>
      )}
    </Card>
  );
}
