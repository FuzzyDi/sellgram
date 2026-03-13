import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

export default function Customers() {
  const { tr } = useAdminI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .getCustomers()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header>
        <h2 className="sg-title">{tr('Клиенты', 'Mijozlar')}</h2>
        <p className="sg-subtitle">{tr('Сводка по базе клиентов вашего магазина', "Do'koningiz mijozlari bo'yicha umumiy ko'rinish")}</p>
      </header>

      {loading ? (
        <p className="sg-subtitle">{tr('Загрузка...', 'Yuklanmoqda...')}</p>
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
                    <div style={{ fontWeight: 700 }}>{customer.firstName} {customer.lastName}</div>
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
                    {tr('Пока нет клиентов', 'Hozircha mijozlar yo‘q')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ padding: '12px 14px', borderTop: '1px solid #edf2ee', color: '#5f6d64', fontSize: 13 }}>
            {tr('Всего клиентов', 'Jami mijozlar')}: {data?.total || 0}
          </div>
        </div>
      )}
    </section>
  );
}
