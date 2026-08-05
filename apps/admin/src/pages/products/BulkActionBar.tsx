import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';

interface BulkActionBarProps {
  count: number;
  bulking: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onShowInMiniapp: () => void;
  onHideFromMiniapp: () => void;
  onCancel: () => void;
}

export default function BulkActionBar({ count, bulking, onActivate, onDeactivate, onShowInMiniapp, onHideFromMiniapp, onCancel }: BulkActionBarProps) {
  const { tr } = useAdminI18n();

  return (
    <Card className="flex items-center gap-2.5 bg-warning/10 border-warning/30 flex-wrap">
      <span className="text-token-sm font-semibold text-warning">
        {tr(`Выбрано: ${count}`, `Tanlandi: ${count}`)}
      </span>
      <Button variant="ghost" size="sm" type="button" disabled={bulking} onClick={onActivate}>
        {tr('Активировать', 'Faollashtirish')}
      </Button>
      <Button variant="ghost" size="sm" type="button" disabled={bulking} onClick={onDeactivate}>
        {tr('Скрыть', 'Yashirish')}
      </Button>
      <Button variant="ghost" size="sm" type="button" disabled={bulking} onClick={onShowInMiniapp}>
        {tr('Показать в Telegram', "Telegramda ko'rsatish")}
      </Button>
      <Button variant="ghost" size="sm" type="button" disabled={bulking} onClick={onHideFromMiniapp}>
        {tr('Скрыть из Telegram', "Telegramdan yashirish")}
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
