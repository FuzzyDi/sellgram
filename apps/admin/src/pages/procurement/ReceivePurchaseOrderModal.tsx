import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';

interface ReceivePurchaseOrderModalProps {
  po: any;
  receiveItems: Record<string, number>;
  setReceiveItems: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export default function ReceivePurchaseOrderModal({ po, receiveItems, setReceiveItems, saving, onClose, onSubmit }: ReceivePurchaseOrderModalProps) {
  const { tr } = useAdminI18n();

  return (
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
      <Card className="w-full max-w-[480px] max-h-[80vh] overflow-auto">
        <h3 className="m-0 mb-3 text-token-base font-semibold text-neutral-800">
          {tr('Приёмка поставки', 'Yetkazib berishni qabul qilish')} PO-{po.poNumber}
        </h3>
        <p className="mb-3 text-token-sm text-neutral-500">
          {tr('Укажите фактически полученное количество', 'Amalda qabul qilingan miqdorni kiriting')}
        </p>
        {(po.items || []).map((item: any) => (
          <div key={item.id} className="flex gap-2.5 items-center mb-2">
            <span className="flex-1 text-token-sm text-neutral-700">{item.product?.name || item.productId}</span>
            <span className="text-token-xs text-neutral-500 whitespace-nowrap">{tr('из', 'dan')} {item.qty}</span>
            <input
              type="number"
              min={0}
              max={item.qty}
              value={receiveItems[item.id] ?? item.qty}
              onChange={(e) => setReceiveItems((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
              className="w-20 rounded-token-md border border-neutral-300 px-2 py-1.5 text-token-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
            />
          </div>
        ))}
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="md" type="button" onClick={onClose} disabled={saving}>{tr('Отмена', 'Bekor')}</Button>
          <Button variant="primary" size="md" type="button" onClick={onSubmit} disabled={saving}>
            {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Подтвердить приёмку', 'Qabul qilishni tasdiqlash')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
