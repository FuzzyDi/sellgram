import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';

interface BulkActionBarProps {
  count: number;
  bulking: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onCancel: () => void;
}

export default function BulkActionBar({ count, bulking, onActivate, onDeactivate, onCancel }: BulkActionBarProps) {
  const { tr } = useAdminI18n();

  return (
    <Card className="flex items-center gap-2.5 bg-warning/10 border-warning/30">
      <span className="text-token-sm font-semibold text-warning">
        {tr(`Выбрано: ${count}`, `Tanlandi: ${count}`)}
      </span>
      <Button variant="ghost" size="sm" type="button" disabled={bulking} onClick={onActivate}>
        {tr('Активировать', 'Faollashtirish')}
      </Button>
      <Button variant="ghost" size="sm" type="button" disabled={bulking} onClick={onDeactivate}>
        {tr('Скрыть', 'Yashirish')}
      </Button>
      <button
        className="ml-auto bg-transparent border-none cursor-pointer text-token-xs text-neutral-400"
        type="button"
        onClick={onCancel}
      >
        {tr('Отмена', 'Bekor')}
      </button>
    </Card>
  );
}
