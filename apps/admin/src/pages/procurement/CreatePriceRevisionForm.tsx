import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';

export interface PriceRevisionItemDraft {
  productId: string;
  newPrice: string;
  newPosPrice: string;
  newWholesalePrice: string;
}

interface CreatePriceRevisionFormProps {
  products: any[];
  note: string;
  setNote: (value: string) => void;
  items: PriceRevisionItemDraft[];
  addItem: () => void;
  removeItem: (idx: number) => void;
  updateItem: (idx: number, field: keyof PriceRevisionItemDraft, value: string) => void;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function CreatePriceRevisionForm({
  products, note, setNote, items, addItem, removeItem, updateItem, saving, onSubmit, onCancel,
}: CreatePriceRevisionFormProps) {
  const { tr } = useAdminI18n();

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="m-0 text-token-base font-semibold text-neutral-800">{tr('Новая переоценка', "Yangi qayta baholash")}</h3>

      <div>
        <label className="block mb-1 text-token-xs text-neutral-500">{tr('Комментарий', 'Izoh')}</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('Например, весенняя акция', "Masalan, bahorgi aksiya")} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-token-xs text-neutral-500">{tr('Товары *', 'Mahsulotlar *')}</label>
          <Button variant="ghost" size="sm" type="button" onClick={addItem}>
            + {tr('Добавить товар', "Mahsulot qo'shish")}
          </Button>
        </div>
        <div className="flex gap-2 mb-1 items-center" style={{ paddingRight: items.length > 1 ? 28 : 0 }}>
          <span className="flex-[2] text-token-xs font-semibold text-neutral-500 pl-2.5">{tr('Товар', 'Mahsulot')}</span>
          <span className="flex-1 text-token-xs font-semibold text-neutral-500 pl-2">{tr('Telegram', 'Telegram')}</span>
          <span className="flex-1 text-token-xs font-semibold text-neutral-500 pl-2">{tr('POS', 'POS')}</span>
          <span className="flex-1 text-token-xs font-semibold text-neutral-500 pl-2">{tr('Опт', 'Ulgurji')}</span>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 mb-2 items-center">
            <div className="flex-[2]">
              <Select value={item.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)}>
                <option value="">{tr('— выберите товар —', '— mahsulot tanlang —')}</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="flex-1">
              <Input type="number" min={0} value={item.newPrice} placeholder={tr('без изменений', "o'zgarishsiz")} onChange={(e) => updateItem(idx, 'newPrice', e.target.value)} />
            </div>
            <div className="flex-1">
              <Input type="number" min={0} value={item.newPosPrice} placeholder={tr('без изменений', "o'zgarishsiz")} onChange={(e) => updateItem(idx, 'newPosPrice', e.target.value)} />
            </div>
            <div className="flex-1">
              <Input type="number" min={0} value={item.newWholesalePrice} placeholder={tr('без изменений', "o'zgarishsiz")} onChange={(e) => updateItem(idx, 'newWholesalePrice', e.target.value)} />
            </div>
            {items.length > 1 && (
              <button onClick={() => removeItem(idx)} className="bg-transparent border-none cursor-pointer text-danger text-token-lg leading-none px-1">×</button>
            )}
          </div>
        ))}
        <p className="text-token-xs text-neutral-500 mt-1">
          {tr('Заполняйте только те каналы, цену которых меняете — пустое поле оставит канал без изменений', "Faqat narxini o'zgartirayotgan kanallarni to'ldiring — bo'sh maydon kanalni o'zgarishsiz qoldiradi")}
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="md" type="button" onClick={onCancel} disabled={saving}>{tr('Отмена', 'Bekor')}</Button>
        <Button variant="primary" size="md" type="button" onClick={onSubmit} disabled={saving}>
          {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Создать переоценку', "Qayta baholash yaratish")}
        </Button>
      </div>
    </Card>
  );
}
