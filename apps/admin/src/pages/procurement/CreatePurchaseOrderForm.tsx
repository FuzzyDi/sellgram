import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';

export interface POItemDraft {
  productId: string;
  qty: number;
  unitCost: number;
}

interface CreatePurchaseOrderFormProps {
  suppliers: any[];
  products: any[];
  supplierId: string;
  setSupplierId: (value: string) => void;
  supplier: string;
  setSupplier: (value: string) => void;
  currency: string;
  setCurrency: (value: string) => void;
  fxRate: string;
  setFxRate: (value: string) => void;
  shippingCost: string;
  setShippingCost: (value: string) => void;
  customsCost: string;
  setCustomsCost: (value: string) => void;
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

export default function CreatePurchaseOrderForm({
  suppliers, products, supplierId, setSupplierId, supplier, setSupplier,
  currency, setCurrency, fxRate, setFxRate, shippingCost, setShippingCost,
  customsCost, setCustomsCost, note, setNote, items, addItem, removeItem, updateItem,
  createTotal, saving, onSubmit, onCancel,
}: CreatePurchaseOrderFormProps) {
  const { tr, locale } = useAdminI18n();

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="m-0 text-token-base font-semibold text-neutral-800">{tr('Новый заказ поставщику', 'Yangi yetkazib beruvchi buyurtmasi')}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block mb-1 text-token-xs text-neutral-500">{tr('Поставщик *', 'Yetkazib beruvchi *')}</label>
          {suppliers.length > 0 ? (
            <>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">{tr('— выберите контрагента —', '— kontragentni tanlang —')}</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              {!supplierId && (
                <div className="mt-1.5">
                  <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder={tr('Или введите название вручную', "Yoki nomni qo'lda kiriting")} />
                </div>
              )}
            </>
          ) : (
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder={tr('Название компании', 'Kompaniya nomi')} />
          )}
        </div>
        <div>
          <label className="block mb-1 text-token-xs text-neutral-500">{tr('Валюта', 'Valyuta')}</label>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['USD', 'EUR', 'CNY', 'UZS', 'RUB'].map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <label className="block mb-1 text-token-xs text-neutral-500">{tr('Курс к UZS', 'UZS kursi')}</label>
          <Input type="number" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="12500" />
        </div>
        <div>
          <label className="block mb-1 text-token-xs text-neutral-500">{tr('Доставка (UZS)', 'Yetkazib berish (UZS)')}</label>
          <Input type="number" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
        </div>
        <div>
          <label className="block mb-1 text-token-xs text-neutral-500">{tr('Таможня (UZS)', 'Bojxona (UZS)')}</label>
          <Input type="number" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} />
        </div>
        <div>
          <label className="block mb-1 text-token-xs text-neutral-500">{tr('Заметка', 'Izoh')}</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
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
          <span className="flex-1 text-token-xs font-semibold text-neutral-500 pl-2">{tr('Цена покупная', 'Sotib olish narxi')}</span>
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
          {tr('Итого (без доп. расходов)', "Jami (qo'shimcha xarajatlarsiz)")}: <strong className="text-neutral-700">{createTotal.toLocaleString(locale)}</strong>
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="md" type="button" onClick={onCancel} disabled={saving}>{tr('Отмена', 'Bekor')}</Button>
        <Button variant="primary" size="md" type="button" onClick={onSubmit} disabled={saving}>
          {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Создать заказ', 'Buyurtma yaratish')}
        </Button>
      </div>
    </Card>
  );
}
