import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

export default function SysAnalytics() {
  const [dash, setDash] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [growth, setGrowth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      systemApi.dashboard().then(setDash),
      systemApi.revenueTrend().then(setTrend),
      systemApi.tenants('pageSize=200&page=1').then((d) => setTenants(d?.items || d || [])),
      systemApi.growth().then(setGrowth),
    ]).finally(() => setLoading(false));
  }, []);

  const plans = { FREE: 0, PRO: 0, BUSINESS: 0 };
  tenants.forEach((t: any) => { if (t.plan in plans) (plans as any)[t.plan]++; });
  const planTotal = tenants.length || 1;

  const topByRevenue = [...tenants].sort((a, b) => (b.revenueMonth ?? 0) - (a.revenueMonth ?? 0)).slice(0, 10);
  const topByOrders = [...tenants].sort((a, b) => (b.ordersMonth ?? 0) - (a.ordersMonth ?? 0)).slice(0, 10);

  const totalRevenue = trend.reduce((s: number, d: any) => s + (d.revenue || 0), 0);
  const avgRevenue = trend.length > 0 ? totalRevenue / trend.length : 0;
  const maxBar = Math.max(...trend.map((d: any) => d.revenue || 0), 1);

  const mrr = (dash?.revenueMonth ?? 0);
  const arr = mrr * 12;

  const funnel = growth?.funnel;
  const registrations: any[] = growth?.registrations ?? [];
  const inactive: any[] = growth?.inactive ?? [];
  const maxReg = Math.max(...registrations.map((r: any) => r.count), 1);
  const convRate = funnel ? Math.round((funnel.paid / Math.max(funnel.total, 1)) * 100) : 0;

  if (loading) return <div style={{ padding: 28, color: '#94a3b8' }}>Загрузка...</div>;

  return (
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Аналитика платформы</h1>

      {/* MRR/ARR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        {[
          { label: 'MRR (месяц)', value: `${(mrr / 1_000_000).toFixed(2)}M UZS`, color: '#059669' },
          { label: 'ARR (год ×12)', value: `${(arr / 1_000_000).toFixed(1)}M UZS`, color: '#3b82f6' },
          { label: 'Всего тенантов', value: funnel?.total ?? tenants.length, color: undefined },
          { label: 'Платных (PRO+BIZ)', value: plans.PRO + plans.BUSINESS, color: '#8b5cf6' },
          { label: 'Конверсия FREE→paid', value: `${convRate}%`, color: convRate > 10 ? '#059669' : '#f59e0b' },
          { label: 'Заказов /месяц', value: (dash?.ordersMonth ?? 0).toLocaleString(), color: undefined },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: color || '#0f172a', lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Registrations + Plan distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        {/* Weekly registrations */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#0f172a' }}>Новые регистрации (последние 12 недель)</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
            Итого за период: {registrations.reduce((s: number, r: any) => s + r.count, 0)}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
            {registrations.map((r: any) => {
              const pct = r.count / maxReg;
              return (
                <div key={r.label} title={`${r.label}: ${r.count} регистраций`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 9, color: '#9ca3af' }}>{r.count > 0 ? r.count : ''}</span>
                  <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${Math.max(pct * 76, r.count > 0 ? 4 : 2)}px`, background: r.count > 0 ? 'linear-gradient(180deg,#8b5cf6,#6d28d9)' : '#f1f5f9' }} />
                  <span style={{ fontSize: 9, color: '#9ca3af', whiteSpace: 'nowrap' }}>{r.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Plan distribution */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: '#0f172a' }}>Распределение по планам</div>
          {[
            { plan: 'BUSINESS', count: plans.BUSINESS, color: '#f59e0b' },
            { plan: 'PRO', count: plans.PRO, color: '#8b5cf6' },
            { plan: 'FREE', count: plans.FREE, color: '#94a3b8' },
          ].map(({ plan, count, color }) => (
            <div key={plan} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{plan}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color }}>{count} <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>({Math.round(count / planTotal * 100)}%)</span></span>
              </div>
              <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: color, width: `${count / planTotal * 100}%`, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversion funnel */}
      {funnel && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: '#0f172a' }}>Воронка конверсии</div>
          <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
            {[
              { label: 'Зарегистрировались', value: funnel.total, color: '#6366f1', bg: '#eef2ff' },
              { label: 'Создали магазин', value: funnel.withStores, color: '#3b82f6', bg: '#eff6ff' },
              { label: 'Получили заказ', value: funnel.withOrders, color: '#10b981', bg: '#f0fdf4' },
              { label: 'Перешли на платный', value: funnel.paid, color: '#f59e0b', bg: '#fffbeb' },
            ].map(({ label, value, color, bg }, i, arr) => {
              const prev = i === 0 ? funnel.total : arr[i - 1].value;
              const pct = Math.round((value / Math.max(prev, 1)) * 100);
              return (
                <div key={label} style={{ flex: 1, padding: '16px 14px', background: bg, borderRadius: i === 0 ? '10px 0 0 10px' : i === arr.length - 1 ? '0 10px 10px 0' : 0, borderRight: i < arr.length - 1 ? '2px solid #fff' : 'none', textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 12, color: '#374151', fontWeight: 600, marginTop: 4 }}>{label}</div>
                  {i > 0 && (
                    <div style={{ fontSize: 11, color: pct < 30 ? '#ef4444' : '#64748b', marginTop: 4 }}>
                      {pct}% от предыдущего
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Revenue trend */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#0f172a' }}>Выручка по месяцам (PAID инвойсы)</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Среднемесячная: {(avgRevenue / 1_000_000).toFixed(2)}M UZS</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
          {trend.map((d: any) => {
            const pct = (d.revenue || 0) / maxBar;
            const month = String(d.label || d.month || '').slice(5);
            return (
              <div key={d.label || d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 9, color: '#9ca3af' }}>{d.revenue > 0 ? `${(d.revenue / 1_000_000).toFixed(1)}M` : ''}</span>
                <div style={{ width: '100%', borderRadius: '4px 4px 0 0', height: `${Math.max(pct * 110, d.revenue > 0 ? 4 : 0)}px`, background: 'linear-gradient(180deg,#10b981,#059669)' }}
                  title={`${d.label}: ${(d.revenue || 0).toLocaleString()} UZS`} />
                <span style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>{month}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Top by revenue */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 14 }}>Топ-10 по выручке (месяц)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {topByRevenue.map((t: any, i: number) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '8px 14px', color: '#94a3b8', fontWeight: 700, width: 28 }}>{i + 1}</td>
                  <td style={{ padding: '8px 14px', fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                    {((t.revenueMonth ?? 0) / 1_000_000).toFixed(2)}M
                  </td>
                </tr>
              ))}
              {topByRevenue.length === 0 && <tr><td colSpan={3} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Нет данных</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Inactive tenants */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Неактивные магазины</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>нет заказов &gt; 14 дней</span>
          </div>
          {inactive.length === 0 ? (
            <div style={{ padding: '20px 18px', color: '#94a3b8', fontSize: 13 }}>Все магазины активны</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {inactive.map((t: any) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 600 }}>{t.name}</td>
                    <td style={{ padding: '8px 14px', color: '#94a3b8', fontSize: 12 }}>{t.email}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: t.plan === 'FREE' ? '#f1f5f9' : '#fef9c3', color: t.plan === 'FREE' ? '#64748b' : '#92400e', fontWeight: 700 }}>
                        {t.plan}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top by orders */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 14 }}>Топ-10 по заказам (месяц)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {topByOrders.map((t: any, i: number) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '8px 14px', color: '#94a3b8', fontWeight: 700, width: 28 }}>{i + 1}</td>
                <td style={{ padding: '8px 14px', fontWeight: 600 }}>{t.name}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>{t.ordersMonth ?? 0}</td>
              </tr>
            ))}
            {topByOrders.length === 0 && <tr><td colSpan={3} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Нет данных</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
