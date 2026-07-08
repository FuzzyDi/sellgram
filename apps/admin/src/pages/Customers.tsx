import React, { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Table, { type TableColumn } from '../components/Table';
import CustomerDrawer from './customers/CustomerDrawer';

export default function Customers() {
  const { tr } = useAdminI18n();
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleExport() {
    setExporting(true);
    try { await adminApi.downloadCustomersCsv(); } catch { /* ignore */ } finally { setExporting(false); }
  }

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  useEffect(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '30');
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

    adminApi
      .getCustomers(params.toString())
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch]);

  const totalPages = useMemo(() => Math.max(1, data?.totalPages || 1), [data?.totalPages]);

  if (error) {
    return (
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Клиенты', 'Mijozlar')}</h2>
        </header>
        <Card className="text-center py-8 px-4">
          <p className="m-0 font-semibold text-danger">{tr('Не удалось загрузить клиентов', "Mijozlarni yuklab bo'lmadi")}</p>
          <Button variant="ghost" size="md" type="button" className="mt-3.5" onClick={() => { setPage(1); setError(false); setLoading(true); }}>
            {tr('Повторить', 'Qayta urinish')}
          </Button>
        </Card>
      </section>
    );
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'customer',
      header: tr('Клиент', 'Mijoz'),
      render: (customer) => (
        <div>
          <div className="font-semibold text-neutral-800">{[customer.firstName, customer.lastName].filter(Boolean).join(' ') || '-'}</div>
          {customer.phone && <div className="text-token-xs text-neutral-500">{customer.phone}</div>}
        </div>
      ),
    },
    {
      key: 'telegram',
      header: 'Telegram',
      render: (customer) => customer.telegramUser ? `@${customer.telegramUser}` : customer.telegramId || '-',
    },
    {
      key: 'orders',
      header: tr('Заказов', 'Buyurtmalar'),
      width: 90,
      render: (customer) => customer.ordersCount || 0,
    },
    {
      key: 'spent',
      header: tr('Потрачено', 'Sarflangan'),
      width: 130,
      render: (customer) => <span className="font-semibold text-neutral-800">{Number(customer.totalSpent || 0).toLocaleString()} UZS</span>,
    },
    {
      key: 'loyalty',
      header: tr('Баллы', 'Ballar'),
      width: 80,
      render: (customer) => customer.loyaltyPoints || 0,
    },
  ];

  return (
    <>
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Клиенты', 'Mijozlar')}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">{tr('Сводка по базе клиентов вашего магазина', "Do'koningiz mijozlari bo'yicha umumiy ko'rinish")}</p>
        </header>

        <Card className="flex gap-2 items-center flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={tr('Поиск: имя, @username, телефон', 'Qidiruv: ism, @username, telefon')}
            />
          </div>
          <Button
            variant="ghost"
            size="md"
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            title={tr('Экспорт до 10 000 клиентов. Лимит: 5 выгрузок в минуту.', "Maksimal 10 000 mijoz. Limit: daqiqada 5 ta yuklab olish.")}
          >
            {exporting ? '⏳' : '⬇️'} CSV
          </Button>
        </Card>

        <Card className="overflow-hidden" style={{ padding: 0 }}>
          <Table
            columns={columns}
            data={data?.items || []}
            rowKey={(customer) => customer.id}
            loading={loading}
            onRowClick={(customer) => setSelectedId(customer.id)}
            emptyMessage={tr('Пока нет клиентов', "Hozircha mijozlar yo'q")}
          />
          {!loading && (
            <>
              <div className="px-3.5 py-3 border-t border-neutral-200 text-token-sm text-neutral-500 flex items-center justify-between gap-2">
                <span>
                  {tr('Всего клиентов', 'Jami mijozlar')}: {data?.total || 0}
                </span>
                <span>
                  {tr('Страница', 'Sahifa')} {data?.page || page} / {totalPages}
                </span>
              </div>
              <div className="px-3.5 pb-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" type="button" disabled={(data?.page || page) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {tr('Назад', 'Orqaga')}
                </Button>
                <Button variant="ghost" size="sm" type="button" disabled={(data?.page || page) >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  {tr('Далее', 'Keyingi')}
                </Button>
              </div>
            </>
          )}
        </Card>
      </section>

      {selectedId && (
        <CustomerDrawer
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          tr={tr}
        />
      )}
    </>
  );
}
