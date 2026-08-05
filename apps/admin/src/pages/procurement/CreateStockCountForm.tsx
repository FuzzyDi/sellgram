import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';

interface CreateStockCountFormProps {
  note: string;
  setNote: (value: string) => void;
  productCount: number;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function CreateStockCountForm({ note, setNote, productCount, saving, onSubmit, onCancel }: CreateStockCountFormProps) {
  const { tr } = useAdminI18n();

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="m-0 text-token-base font-semibold text-neutral-800">{tr('Начать инвентаризацию', 'Inventarizatsiyani boshlash')}</h3>
      <p className="m-0 text-token-sm text-neutral-500">
        {tr(
          `В документ попадут все товары в остатке (${productCount} шт.) с текущим количеством как «ожидается». Вписывайте «посчитано» по каждой позиции — можно не досчитывать всё сразу, непосчитанные строки при подтверждении не тронут остатки.`,
          `Hujjatga barcha mahsulotlar (${productCount} ta) joriy miqdori bilan «kutilmoqda» sifatida qo'shiladi. Har bir pozitsiya uchun «hisoblandi»ni kiriting — hammasini bir vaqtda sanash shart emas, hisoblanmagan qatorlar tasdiqlashda qoldiqqa tegmaydi.`
        )}
      </p>
      <div>
        <label className="block mb-1 text-token-xs text-neutral-500">{tr('Комментарий', 'Izoh')}</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('Например, плановая инвентаризация склада', "Masalan, rejalashtirilgan ombor inventarizatsiyasi")} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="md" type="button" onClick={onCancel} disabled={saving}>{tr('Отмена', 'Bekor')}</Button>
        <Button variant="primary" size="md" type="button" onClick={onSubmit} disabled={saving || productCount === 0}>
          {saving ? tr('Создание...', 'Yaratilmoqda...') : tr('Начать инвентаризацию', 'Inventarizatsiyani boshlash')}
        </Button>
      </div>
    </Card>
  );
}
