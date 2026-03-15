import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

export default function Customers() {
  const { tr } = useAdminI18n();
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '30');
    if (search.trim()) params.set('search', search.trim());

    adminApi
      .getCustomers(params.toString())
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, search]);

  const totalPages = useMemo(() => Math.max(1, data?.totalPages || 1), [data?.totalPages]);

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header>
        <h2 className="sg-title">{tr('Клиенты', 'Mijozlar')}</h2>
        <p className="sg-subtitle">{tr('Сводка по базе клиентов вашего магазина', "Do'koningiz mijozlari bo'yicha umumiy ko'rinish")}</p>
      </header>

      <div className="sg-card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder={tr('Поиск: имя, @username, телефон', 'Qidiruv: ism, @username, telefon')}
          className="border rounded-lg px-3 py-2 text-sm"
          style={{ minWidth: 280, flex: 1 }}
        />
      </div>

      {loading ? (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 16, padding: '12px 16px', borderBottom: '1px solid #edf2ee', alignItems: 'center' }}>
              <div style={{ flex: 2, display: 'grid', gap: 6 }}>
                <div className="sg-skeleton" style={{ height: 14, width: '50%' }} />
                <div className="sg-skeleton" style={{ height: 11, width: '30%' }} />
              </div>
              <div className="sg-skeleton" style={{ height: 14, width: 80 }} />
              <div className="sg-skeleton" style={{ height: 14, width: 40 }} />
              <div className="sg-skeleton" style={{ height: 14, width: 80 }} />
              <div className="sg-skeleton" style={{ height: 14, width: 40 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th>{tr('Клиент', 'Mijoz')}</th>
                <th>Telegram</th>
                <th>{tr('Заказов', 'Buyurtmalar')}</th>
                <th>{tr('Потрачено', 'Sarflangan')}</th>
                <th>{tr('Баллы', 'Ballar')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items?.map((customer: any) => (
                <tr key={customer.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{[customer.firstName, customer.lastName].filter(Boolean).join(' ') || '-'}</div>
                    {customer.phone && <div style={{ fontSize: 12, color: '#6c7b72' }}>{customer.phone}</div>}
                  </td>
                  <td>{customer.telegramUser ? `@${customer.telegramUser}` : customer.telegramId || '-'}</td>
                  <td>{customer.ordersCount || 0}</td>
                  <td style={{ fontWeight: 700 }}>{Number(customer.totalSpent || 0).toLocaleString()} UZS</td>
                  <td>{customer.loyaltyPoints || 0}</td>
                </tr>
              ))}
              {(data?.items || []).length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#6b7a71' }}>
                    {tr('Пока нет клиентов', "Hozircha mijozlar yo'q")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ padding: '12px 14px', borderTop: '1px solid #edf2ee', color: '#5f6d64', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>
              {tr('Всего клиентов', 'Jami mijozlar')}: {data?.total || 0}
            </span>
            <span>
              {tr('Страница', 'Sahifa')} {data?.page || page} / {totalPages}
            </span>
          </div>
          <div style={{ padding: '0 14px 12px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="sg-btn ghost" disabled={(data?.page || page) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {tr('Назад', 'Orqaga')}
            </button>
            <button className="sg-btn ghost" disabled={(data?.page || page) >= totalPages} onClick={() => setPage((p) => p + 1)}>
              {tr('Далее', 'Keyingi')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
