import React from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import { useAdminI18n } from '../../i18n';

const ALL_STATUSES = ['', 'NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'];

interface OrdersFiltersProps {
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statusLabels: Record<string, string>;
  paymentFilter: string;
  onPaymentFilterChange: (value: string) => void;
  paymentLabels: Record<string, string>;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onReset: () => void;
  exporting: boolean;
  onExport: () => void;
  total?: number;
  showTotal: boolean;
}

export default function OrdersFilters({
  statusFilter, onStatusFilterChange, statusLabels,
  paymentFilter, onPaymentFilterChange, paymentLabels,
  dateFrom, onDateFromChange, dateTo, onDateToChange,
  search, onSearchChange, onReset, exporting, onExport, total, showTotal,
}: OrdersFiltersProps) {
  const { tr } = useAdminI18n();
  const hasActiveFilters = statusFilter || paymentFilter || search || dateFrom || dateTo;

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {ALL_STATUSES.map((s) => (
          <Button
            key={s || 'all'}
            variant={statusFilter === s ? 'primary' : 'ghost'}
            size="sm"
            type="button"
            onClick={() => onStatusFilterChange(s)}
          >
            {s ? statusLabels[s] : tr('Все', 'Barchasi')}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="w-44">
          <Select value={paymentFilter} onChange={(e) => onPaymentFilterChange(e.target.value)}>
            <option value="">{tr('Любая оплата', "To'lov: barchasi")}</option>
            <option value="PENDING">{paymentLabels.PENDING}</option>
            <option value="PAID">{paymentLabels.PAID}</option>
            <option value="REFUNDED">{paymentLabels.REFUNDED}</option>
          </Select>
        </div>
        <div className="w-40">
          <Input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} title={tr('Дата с', 'Dan sana')} />
        </div>
        <span className="text-token-xs text-neutral-400">—</span>
        <div className="w-40">
          <Input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} title={tr('Дата по', 'Gacha sana')} />
        </div>
        <div className="flex-1 min-w-[240px]">
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={tr('Поиск: № заказа, клиент, телефон', 'Qidiruv: buyurtma №, mijoz, telefon')}
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" type="button" onClick={onReset}>
            {tr('Сбросить', 'Tozalash')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={exporting}
          onClick={onExport}
          title={tr('Экспорт до 5 000 заказов с текущими фильтрами. Лимит: 5 выгрузок в минуту.', "Joriy filtrlar bilan 5 000 ta buyurtmani eksport qilish. Limit: daqiqada 5 ta.")}
        >
          {exporting ? '...' : tr('↓ CSV', '↓ CSV')}
        </Button>
      </div>

      {showTotal && (
        <p className="m-0 text-token-xs text-neutral-500">
          {tr('Найдено', 'Topildi')}: <strong className="text-neutral-700">{total}</strong>
        </p>
      )}
    </Card>
  );
}
