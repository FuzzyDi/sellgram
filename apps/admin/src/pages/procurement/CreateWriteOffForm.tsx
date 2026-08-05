import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import type { POItemDraft } from './CreatePurchaseOrderForm';
import type { WriteOffReason } from './types';

interface CreateWriteOffFormProps {
  products: any[];
  purchaseOrders: any[];
  reason: WriteOffReason;
  setReason: (value: WriteOffReason) => void;
  purchaseOrderId: string;
  setPurchaseOrderId: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  items: POItemDraft[];
  addItem: () => void;
  removeItem: (idx: number) => void;
  updateItem: (idx: number, field: string, value: string | number) => void;
  createTotal: number;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function CreateWriteOffForm({
  products, purchaseOrders, reason, setReason, purchaseOrderId, setPurchaseOrderId,
  note, setNote, items, addItem, removeItem, updateItem, createTotal, saving, onSubmit, onCancel,
}: CreateWriteOffFormProps) {
  const { tr, locale } = useAdminI18n();

  const reasonLabel: Record<WriteOffReason, string> = {
    DEFECT: tr('Брак', 'Nuqsonli'),
    DAMAGE: tr('Порча', 'Shikastlangan'),
    SHORTAGE: tr('Недостача', 'Yetishmovchilik'),
    INTERNAL_USE: tr('Собственные нужды', "O'z ehtiyoji"),
    OTHER: tr('Другое', 'Boshqa'),
  };

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="m-0 text-token-base font-semibold text-neutral-800">{tr('Новое списание', "Yangi hisobdan chiqarish")}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block mb-1 text-token-xs text-neutral-500">{tr('Причина', 'Sababi')}</label>
          <Select value={reason} onChange={(e) => setReason(e.target.value as WriteOffReason)}>
            {(Object.keys(reasonLabel) as WriteOffReason[]).map((r) => <option key={r} value={r}>{reasonLabel[r]}</option>)}
          </Select>
        </div>
        <div>
          <label className="block mb-1 text-token-xs text-neutral-500">{tr('Связан с документом', "Hujjat bilan bog'liq")}</label>
          <Select value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)}>
            <option value="">{tr('— не связан —', "— bog'lanmagan —")}</option>
            {purchaseOrders.map((d: any) => <option key={d.id} value={d.id}>PO-{d.poNumber} · {d.supplierName}</option>)}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <label className="block mb-1 text-token-xs text-neutral-500">{tr('Комментарий', 'Izoh')}</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('Например, пересчёт склада 01.08', "Masalan, 01.08 ombor inventarizatsiyasi")} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-token-xs text-neutral-500">{tr('Товары *', 'Mahsulotlar *')}</label>
          <Button variant="ghost" size="sm" type="button" onClick={addItem}>
            + {tr('Добавить товар', "Mahsulot qo'shish")}
          </Button>
        </div>
        <div className="flex gap-2 mb-1 items-center" style={{ paddingRight: items.length > 1 ? 28 : 0 }}>
          <span className="flex-[3] text-token-xs font-semibold text-neutral-500 pl-2.5">{tr('Товар', 'Mahsulot')}</span>
          <span className="flex-1 text-token-xs font-semibold text-neutral-500 pl-2">{tr('Количество', 'Miqdor')}</span>
          <span className="flex-1 text-token-xs font-semibold text-neutral-500 pl-2">{tr('Себестоимость', 'Tannarx')}</span>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 mb-2 items-center">
            <div className="flex-[3]">
              <Select value={item.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)}>
                <option value="">{tr('— выберите товар —', '— mahsulot tanlang —')}</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="flex-1">
              <Input type="number" value={item.qty} min={1} onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))} />
            </div>
            <div className="flex-1">
              <Input type="number" value={item.unitCost} min={0} onChange={(e) => updateItem(idx, 'unitCost', Number(e.target.value))} />
            </div>
            {items.length > 1 && (
              <button onClick={() => removeItem(idx)} className="bg-transparent border-none cursor-pointer text-danger text-token-lg leading-none px-1">×</button>
            )}
          </div>
        ))}
        <p className="text-token-xs text-neutral-500 mt-1">
          {tr('Итого', 'Jami')}: <strong className="text-neutral-700">{createTotal.toLocaleString(locale)}</strong>
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="md" type="button" onClick={onCancel} disabled={saving}>{tr('Отмена', 'Bekor')}</Button>
        <Button variant="primary" size="md" type="button" onClick={onSubmit} disabled={saving}>
          {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Создать списание', "Hisobdan chiqarish yaratish")}
        </Button>
      </div>
    </Card>
  );
}
