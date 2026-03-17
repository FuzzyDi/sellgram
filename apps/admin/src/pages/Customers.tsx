import React, { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

export default function Customers() {
  const { tr } = useAdminI18n();
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <header>
          <h2 className="sg-title">{tr('Клиенты', 'Mijozlar')}</h2>
        </header>
        <div className="sg-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#be123c' }}>{tr('Не удалось загрузить клиентов', "Mijozlarni yuklab bo'lmadi")}</p>
          <button className="sg-btn ghost" style={{ marginTop: 14 }} onClick={() => { setPage(1); setError(false); setLoading(true); }}>
            {tr('Повторить', 'Qayta urinish')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header>
        <h2 className="sg-title">{tr('Клиенты', 'Mijozlar')}</h2>
        <p className="sg-subtitle">{tr('Сводка по базе клиентов вашего магазина', "Do'koningiz mijozlari bo'yicha umumiy ko'rinish")}</p>
      </header>

      <div className="sg-card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={tr('Поиск: имя, @username, телефон', 'Qidiruv: ism, @username, telefon')}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13, minWidth: 280, flex: 1 }}
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
