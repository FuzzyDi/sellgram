import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Table, { type TableColumn } from '../../components/Table';

interface StockMovementsLogProps {
  movements: any[];
  movementsLoading: boolean;
  logProductFilter: { id: string; name: string } | null;
  onRefresh: () => void;
  onClearFilter: () => void;
  variantNameForMovement: (m: any) => string | null;
  locale: string;
}

export default function StockMovementsLog({
  movements, movementsLoading, logProductFilter, onRefresh, onClearFilter, variantNameForMovement, locale,
}: StockMovementsLogProps) {
  const { tr } = useAdminI18n();

  const columns: TableColumn<any>[] = [
    {
      key: 'date',
      header: tr('Дата', 'Sana'),
      render: (m) => <span className="whitespace-nowrap text-token-xs text-neutral-500">{new Date(m.createdAt).toLocaleString(locale)}</span>,
    },
    {
      key: 'product',
      header: tr('Товар', 'Mahsulot'),
      render: (m) => {
        const variantName = variantNameForMovement(m);
        return (
          <div>
            <div className="text-token-sm text-neutral-800">{m.product?.name ?? '—'}</div>
            {variantName && <div className="text-token-xs text-neutral-500 mt-0.5">{variantName}</div>}
          </div>
        );
      },
    },
    {
      key: 'delta',
      header: tr('Изменение', 'O\'zgarish'),
      align: 'right',
      render: (m) => (
        <span className={`font-semibold ${m.delta > 0 ? 'text-success' : m.delta < 0 ? 'text-danger' : 'text-neutral-500'}`}>
          {m.delta > 0 ? `+${m.delta}` : m.delta}
        </span>
      ),
    },
    {
      key: 'change',
      header: tr('Было → Стало', 'Oldin → Keyin'),
      align: 'right',
      render: (m) => <span className="text-token-xs text-neutral-500">{m.qtyBefore} → {m.qtyAfter}</span>,
    },
    {
      key: 'note',
      header: tr('Причина', 'Sabab'),
      render: (m) => <span className="text-token-xs text-neutral-500">{m.note || '—'}</span>,
    },
  ];

  return (
    <Card style={{ padding: 0 }} className="overflow-hidden">
      <div className="px-4 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="m-0 text-token-base font-semibold text-neutral-800 whitespace-nowrap">
            {tr('Журнал движений', 'Harakatlar jurnali')}
          </h3>
          {logProductFilter && (
            <div className="flex items-center gap-1.5 bg-accent-600/10 rounded-token-md px-2.5 py-1 text-token-xs text-accent-600 font-semibold min-w-0">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
                {logProductFilter.name}
              </span>
              <button
                onClick={onClearFilter}
                className="bg-transparent border-none cursor-pointer text-accent-600 p-0 leading-none text-token-base"
                title={tr('Показать все', 'Hammasini ko\'rsatish')}
              >
                ×
              </button>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" type="button" className="flex-shrink-0" onClick={onRefresh} disabled={movementsLoading}>
          {movementsLoading ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Обновить', 'Yangilash')}
        </Button>
      </div>
      <Table
        columns={columns}
        data={movements}
        rowKey={(m) => m.id}
        loading={movementsLoading}
        emptyMessage={tr('Движений пока нет', 'Hali harakatlar yo\'q')}
      />
    </Card>
  );
}
