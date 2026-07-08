import React from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { useAdminI18n } from '../../i18n';

interface ShipDialogProps {
  trackingInput: string;
  setTrackingInput: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function ShipDialog({ trackingInput, setTrackingInput, onClose, onSubmit }: ShipDialogProps) {
  const { tr } = useAdminI18n();

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-[420px]">
        <h3 className="m-0 mb-3 text-token-lg font-semibold text-neutral-800">
          {tr('Отправить заказ', "Buyurtmani jo'natish")}
        </h3>
        <Input
          autoFocus
          value={trackingInput}
          onChange={(e) => setTrackingInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          label={tr('Трек-номер (необязательно)', 'Kuzatuv raqami (ixtiyoriy)')}
          placeholder="TRK-123456"
        />
        <div className="flex gap-2 justify-end mt-3.5">
          <Button variant="ghost" size="md" type="button" onClick={onClose}>{tr('Отмена', 'Bekor')}</Button>
          <Button variant="primary" size="md" type="button" onClick={onSubmit}>
            {tr('Отправить', "Jo'natish")} 🚚
          </Button>
        </div>
      </Card>
    </div>
  );
}
