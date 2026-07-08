import React from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { useAdminI18n } from '../../i18n';

export interface ActionDialogState {
  orderId: string;
  orderTotal: number;
  action: 'cancel' | 'refund';
}

interface ActionDialogProps {
  actionDialog: ActionDialogState;
  dialogReason: string;
  setDialogReason: (value: string) => void;
  dialogRefundAmount: string;
  setDialogRefundAmount: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function ActionDialog({
  actionDialog, dialogReason, setDialogReason, dialogRefundAmount, setDialogRefundAmount, onClose, onSubmit,
}: ActionDialogProps) {
  const { tr } = useAdminI18n();

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-[460px]">
        <h3 className="m-0 text-token-lg font-semibold text-neutral-800">
          {actionDialog.action === 'cancel'
            ? tr('Отмена заказа', 'Buyurtmani bekor qilish')
            : tr('Возврат', 'Qaytarish')}
        </h3>

        <div className="flex flex-col gap-2.5 mt-3.5">
          <textarea
            autoFocus
            value={dialogReason}
            onChange={(e) => setDialogReason(e.target.value)}
            placeholder={
              actionDialog.action === 'cancel'
                ? tr('Причина отмены (необязательно)', 'Bekor qilish sababi (ixtiyoriy)')
                : tr('Причина возврата (необязательно)', 'Qaytarish sababi (ixtiyoriy)')
            }
            rows={3}
            className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 resize-y"
          />
          {actionDialog.action === 'refund' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-token-sm font-medium text-neutral-700">
                {tr('Сумма возврата', 'Qaytarish summasi')}
              </label>
              <input
                type="number"
                value={dialogRefundAmount}
                onChange={(e) => setDialogRefundAmount(e.target.value)}
                min={0}
                max={actionDialog.orderTotal}
                className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
              />
              <p className="m-0 text-token-xs text-neutral-500">
                {tr('Макс:', 'Maks:')} {actionDialog.orderTotal.toLocaleString()} UZS
              </p>
            </div>
          )}
          <div className="flex gap-2.5">
            <Button variant="danger" size="md" type="button" onClick={onSubmit}>
              {actionDialog.action === 'cancel' ? tr('Отменить заказ', 'Bekor qilish') : tr('Оформить возврат', "Qaytarishni rasmiylashtirish")}
            </Button>
            <Button variant="ghost" size="md" type="button" onClick={onClose}>
              {tr('Отмена', 'Bekor')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
