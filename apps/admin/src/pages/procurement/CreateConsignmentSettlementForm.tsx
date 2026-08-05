import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';

interface CreateConsignmentSettlementFormProps {
  eligiblePurchaseOrders: any[];
  purchaseOrderId: string;
  setPurchaseOrderId: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function CreateConsignmentSettlementForm({
  eligiblePurchaseOrders, purchaseOrderId, setPurchaseOrderId, note, setNote, saving, onSubmit, onCancel,
}: CreateConsignmentSettlementFormProps) {
  const { tr } = useAdminI18n();

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="m-0 text-token-base font-semibold text-neutral-800">{tr('Новый отчёт о реализации', "Yangi realizatsiya hisoboti")}</h3>

      <div>
        <label className="block mb-1 text-token-xs text-neutral-500">{tr('Приходный документ (под реализацию) *', "Kirim hujjati (realizatsiyaga) *")}</label>
        <Select value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)}>
          <option value="">{tr('— выберите документ —', '— hujjatni tanlang —')}</option>
          {eligiblePurchaseOrders.map((po: any) => (
            <option key={po.id} value={po.id}>PO-{po.poNumber} · {po.supplierName}</option>
          ))}
        </Select>
        {eligiblePurchaseOrders.length === 0 && (
          <p className="mt-1 text-token-xs text-warning">
            {tr('Нет полученных документов со способом оплаты «Под реализацию»', "«Realizatsiyaga» to'lov usuli bilan qabul qilingan hujjatlar yo'q")}
          </p>
        )}
      </div>

      <div>
        <label className="block mb-1 text-token-xs text-neutral-500">{tr('Комментарий', 'Izoh')}</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('Например, за первую неделю', "Masalan, birinchi hafta uchun")} />
      </div>

      <p className="text-token-xs text-neutral-500">
        {tr('В отчёт попадут все позиции документа с остатком «нереализовано» — количество проданного впишете на следующем шаге', "Hujjatning barcha «realizatsiya qilinmagan» qoldiqli pozitsiyalari hisobotga qo'shiladi — sotilgan miqdorni keyingi bosqichda kiritasiz")}
      </p>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="md" type="button" onClick={onCancel} disabled={saving}>{tr('Отмена', 'Bekor')}</Button>
        <Button variant="primary" size="md" type="button" onClick={onSubmit} disabled={saving || !purchaseOrderId}>
          {saving ? tr('Создание...', 'Yaratilmoqda...') : tr('Создать отчёт', "Hisobot yaratish")}
        </Button>
      </div>
    </Card>
  );
}
