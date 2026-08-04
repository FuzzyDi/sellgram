import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';

const SECTION_PADDING = { padding: 20 };

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

  if (loading) return <div className="p-7 text-neutral-400">Загрузка...</div>;

  return (
    <div className="p-7 flex flex-col gap-6 max-w-[1200px]">
      <h1 className="m-0 text-token-2xl font-extrabold text-neutral-900">Аналитика платформы</h1>

      {/* MRR/ARR */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {[
          { label: 'MRR (месяц)', value: `${(mrr / 1_000_000).toFixed(2)}M UZS`, color: '#059669' },
          { label: 'ARR (год ×12)', value: `${(arr / 1_000_000).toFixed(1)}M UZS`, color: '#3b82f6' },
          { label: 'Всего тенантов', value: funnel?.total ?? tenants.length, color: undefined },
          { label: 'Платных (PRO+BIZ)', value: plans.PRO + plans.BUSINESS, color: '#8b5cf6' },
          { label: 'Конверсия FREE→paid', value: `${convRate}%`, color: convRate > 10 ? '#059669' : '#f59e0b' },
          { label: 'Заказов /месяц', value: (dash?.ordersMonth ?? 0).toLocaleString(), color: undefined },
        ].map(({ label, value, color }) => (
          <Card key={label} style={{ padding: '16px 18px' }}>
            <div className="text-token-xs text-neutral-500 font-semibold uppercase tracking-wide mb-1.5">{label}</div>
            <div className="text-token-2xl font-extrabold leading-none" style={{ color: color || '#0f172a' }}>{value}</div>
          </Card>
        ))}
      </div>

      {/* Registrations + Plan distribution */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <Card style={SECTION_PADDING}>
          <div className="font-bold text-token-base mb-1 text-neutral-900">Новые регистрации (последние 12 недель)</div>
          <div className="text-token-xs text-neutral-400 mb-4">
            Итого за период: {registrations.reduce((s: number, r: any) => s + r.count, 0)}
          </div>
          <div className="flex items-end gap-1" style={{ height: 100 }}>
            {registrations.map((r: any) => {
              const pct = r.count / maxReg;
              return (
                <div key={r.label} title={`${r.label}: ${r.count} регистраций`} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                  <span className="text-[9px] text-neutral-400">{r.count > 0 ? r.count : ''}</span>
                  <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${Math.max(pct * 76, r.count > 0 ? 4 : 2)}px`, background: r.count > 0 ? 'linear-gradient(180deg,#8b5cf6,#6d28d9)' : '#f1f5f9' }} />
                  <span className="text-[9px] text-neutral-400 whitespace-nowrap">{r.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card style={SECTION_PADDING}>
          <div className="font-bold text-token-base mb-4 text-neutral-900">Распределение по планам</div>
          {[
            { plan: 'BUSINESS', count: plans.BUSINESS, color: '#f59e0b' },
            { plan: 'PRO', count: plans.PRO, color: '#8b5cf6' },
            { plan: 'FREE', count: plans.FREE, color: '#94a3b8' },
          ].map(({ plan, count, color }) => (
            <div key={plan} className="mb-3.5">
              <div className="flex justify-between mb-1">
                <span className="text-token-sm font-semibold text-neutral-700">{plan}</span>
                <span className="text-token-sm font-bold" style={{ color }}>{count} <span className="font-normal text-neutral-400 text-token-xs">({Math.round(count / planTotal * 100)}%)</span></span>
              </div>
              <div className="bg-neutral-100 rounded h-2 overflow-hidden">
                <div className="h-full rounded transition-[width] duration-[400ms] ease-in-out" style={{ background: color, width: `${count / planTotal * 100}%` }} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Conversion funnel */}
      {funnel && (
        <Card style={SECTION_PADDING}>
          <div className="font-bold text-token-base mb-4 text-neutral-900">Воронка конверсии</div>
          <div className="flex items-stretch">
            {[
              { label: 'Зарегистрировались', value: funnel.total, color: '#6366f1', bg: '#eef2ff' },
              { label: 'Создали магазин', value: funnel.withStores, color: '#3b82f6', bg: '#eff6ff' },
              { label: 'Получили заказ', value: funnel.withOrders, color: '#10b981', bg: '#f0fdf4' },
              { label: 'Перешли на платный', value: funnel.paid, color: '#f59e0b', bg: '#fffbeb' },
            ].map(({ label, value, color, bg }, i, arr) => {
              const prev = i === 0 ? funnel.total : arr[i - 1].value;
              const pct = Math.round((value / Math.max(prev, 1)) * 100);
              return (
                <div
                  key={label}
                  className="flex-1 text-center"
                  style={{
                    padding: '16px 14px', background: bg,
                    borderRadius: i === 0 ? '10px 0 0 10px' : i === arr.length - 1 ? '0 10px 10px 0' : 0,
                    borderRight: i < arr.length - 1 ? '2px solid #fff' : 'none',
                  }}
                >
                  <div className="text-[26px] font-black leading-none" style={{ color }}>{value}</div>
                  <div className="text-token-xs text-neutral-700 font-semibold mt-1">{label}</div>
                  {i > 0 && (
                    <div className={`text-[11px] mt-1 ${pct < 30 ? 'text-danger' : 'text-neutral-500'}`}>
                      {pct}% от предыдущего
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Revenue trend */}
      <Card style={SECTION_PADDING}>
        <div className="font-bold text-token-base mb-1 text-neutral-900">Выручка по месяцам (PAID инвойсы)</div>
        <div className="text-token-xs text-neutral-400 mb-4">Среднемесячная: {(avgRevenue / 1_000_000).toFixed(2)}M UZS</div>
        <div className="flex items-end gap-2" style={{ height: 140 }}>
          {trend.map((d: any) => {
            const pct = (d.revenue || 0) / maxBar;
            const month = String(d.label || d.month || '').slice(5);
            return (
              <div key={d.label || d.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[9px] text-neutral-400">{d.revenue > 0 ? `${(d.revenue / 1_000_000).toFixed(1)}M` : ''}</span>
                <div
                  className="w-full"
                  style={{ borderRadius: '4px 4px 0 0', height: `${Math.max(pct * 110, d.revenue > 0 ? 4 : 0)}px`, background: 'linear-gradient(180deg,#10b981,#059669)' }}
                  title={`${d.label}: ${(d.revenue || 0).toLocaleString()} UZS`}
                />
                <span className="text-[10px] text-neutral-500 whitespace-nowrap">{month}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card className="overflow-hidden" style={{ padding: 0 }}>
          <div className="px-4 py-3.5 border-b border-neutral-100 font-bold text-token-base">Топ-10 по выручке (месяц)</div>
          <table className="w-full border-collapse text-token-sm">
            <tbody>
              {topByRevenue.map((t: any, i: number) => (
                <tr key={t.id} className="border-b border-neutral-50 last:border-0">
                  <td className="px-3.5 py-2 text-neutral-400 font-bold w-7">{i + 1}</td>
                  <td className="px-3.5 py-2 font-semibold">{t.name}</td>
                  <td className="px-3.5 py-2 text-right font-bold text-success">
                    {((t.revenueMonth ?? 0) / 1_000_000).toFixed(2)}M
                  </td>
                </tr>
              ))}
              {topByRevenue.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-neutral-400">Нет данных</td></tr>}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden" style={{ padding: 0 }}>
          <div className="px-4 py-3.5 border-b border-neutral-100 flex justify-between items-center">
            <span className="font-bold text-token-base">Неактивные магазины</span>
            <span className="text-token-xs text-neutral-400">нет заказов &gt; 14 дней</span>
          </div>
          {inactive.length === 0 ? (
            <div className="px-4 text-neutral-400 text-token-sm" style={{ padding: '20px 18px' }}>Все магазины активны</div>
          ) : (
            <table className="w-full border-collapse text-token-sm">
              <tbody>
                {inactive.map((t: any) => (
                  <tr key={t.id} className="border-b border-neutral-50 last:border-0">
                    <td className="px-3.5 py-2 font-semibold">{t.name}</td>
                    <td className="px-3.5 py-2 text-neutral-400 text-token-xs">{t.email}</td>
                    <td className="px-3.5 py-2 text-right">
                      <span className={`text-token-xs px-1.5 py-0.5 rounded-token-sm font-bold ${t.plan === 'FREE' ? 'bg-neutral-100 text-neutral-500' : 'bg-warning/15 text-warning'}`}>
                        {t.plan}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Top by orders */}
      <Card className="overflow-hidden" style={{ padding: 0 }}>
        <div className="px-4 py-3.5 border-b border-neutral-100 font-bold text-token-base">Топ-10 по заказам (месяц)</div>
        <table className="w-full border-collapse text-token-sm">
          <tbody>
            {topByOrders.map((t: any, i: number) => (
              <tr key={t.id} className="border-b border-neutral-50 last:border-0">
                <td className="px-3.5 py-2 text-neutral-400 font-bold w-7">{i + 1}</td>
                <td className="px-3.5 py-2 font-semibold">{t.name}</td>
                <td className="px-3.5 py-2 text-right font-bold text-accent-600">{t.ordersMonth ?? 0}</td>
              </tr>
            ))}
            {topByOrders.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-neutral-400">Нет данных</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
