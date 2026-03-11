import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/client';

export default function Customers() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getCustomers().then(setData).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">👥 Клиенты</h2>

      {loading ? <p className="text-gray-400">Загрузка...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-3">Клиент</th>
              <th className="px-4 py-3">Telegram</th>
              <th className="px-4 py-3">Заказов</th>
              <th className="px-4 py-3">Потрачено</th>
              <th className="px-4 py-3">Баллы</th>
            </tr></thead>
            <tbody>
              {data?.items?.map((c: any) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.firstName} {c.lastName}</p>
                    {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.telegramUser ? `@${c.telegramUser}` : c.telegramId}</td>
                  <td className="px-4 py-3">{c.ordersCount}</td>
                  <td className="px-4 py-3 font-medium">{Number(c.totalSpent).toLocaleString()} UZS</td>
                  <td className="px-4 py-3">⭐ {c.loyaltyPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && <div className="px-4 py-3 text-sm text-gray-500 border-t">Всего: {data.total}</div>}
        </div>
      )}
    </div>
  );
}
