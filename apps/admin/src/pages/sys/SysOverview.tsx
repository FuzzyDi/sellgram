import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import type { SysPage } from './SysLayout';
import Card from '../../components/Card';

function Kpi({ label, value, sub, colorClass }: { label: string; value: string | number; sub?: string; colorClass?: string }) {
  return (
    <Card style={{ padding: '18px 20px' }}>
      <div className="text-token-xs text-neutral-500 font-semibold uppercase tracking-wide mb-1.5">{label}</div>
      <div className={`text-[26px] font-extrabold leading-none ${colorClass || 'text-neutral-900'}`}>{value}</div>
      {sub && <div className="text-token-xs text-neutral-400 mt-1">{sub}</div>}
    </Card>
  );
}

const ALERT_CLASSES = {
  error: { box: 'bg-danger/10 border-danger/30', dot: 'bg-danger', text: 'text-danger' },
  warn: { box: 'bg-warning/10 border-warning/30', dot: 'bg-warning', text: 'text-warning' },
  info: { box: 'bg-accent-600/10 border-accent-600/30', dot: 'bg-accent-600', text: 'text-accent-600' },
};

function AlertBanner({ items, onNavigate }: { items: { text: string; severity: 'error' | 'warn' | 'info'; page?: SysPage }[]; onNavigate: (p: SysPage) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => {
        const c = ALERT_CLASSES[item.severity];
        return (
          <div
            key={i}
            onClick={() => item.page && onNavigate(item.page)}
            className={`${c.box} border rounded-token-md px-3.5 py-2.5 flex items-center gap-2.5 ${item.page ? 'cursor-pointer' : ''}`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 inline-block ${c.dot}`} />
            <span className={`${c.text} text-token-sm font-semibold`}>{item.text}</span>
            {item.page && <span className={`ml-auto text-token-xs ${c.text}`}>→</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function SysOverview({ onNavigate }: { onNavigate: (p: SysPage) => void }) {
  const [dash, setDash] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [stalledOnboarding, setStalledOnboarding] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      systemApi.dashboard().then(setDash),
      systemApi.health().then(setHealth),
      systemApi.revenueTrend().then(setTrend),
      systemApi.activity('limit=10').then((d) => setActivity(d?.items || d || [])),
      systemApi.pendingInvoices().then(setPendingInvoices),
      systemApi.bots().then(setBots),
      systemApi.stalledOnboarding().then(setStalledOnboarding),
    ]).finally(() => setLoading(false));
  }, []);

  const alerts: { text: string; severity: 'error' | 'warn' | 'info'; page?: SysPage }[] = [];
  if (pendingInvoices.length > 0) alerts.push({ text: `${pendingInvoices.length} инвойс(ов) ожидают подтверждения`, severity: 'warn', page: 'invoices' });
  if (dash?.expiringPlans > 0) {
    alerts.push({ text: `${dash.expiringPlans} план(ов) истекает в течение 7 дней`, severity: 'warn', page: 'tenants' });
  }
  if (stalledOnboarding.length > 0) {
    alerts.push({ text: `${stalledOnboarding.length} регистраци(й) зависли без подключённого бота`, severity: 'warn', page: 'tenants' });
  }
  const failedBots = bots.filter((b) => !b.isActive);
  if (failedBots.length > 0) alerts.push({ text: `${failedBots.length} бот(ов) неактивны`, severity: 'error', page: 'monitoring' });
  if (health && health.db?.latencyMs > 200) alerts.push({ text: `Высокая задержка БД: ${health.db.latencyMs}ms`, severity: 'warn', page: 'monitoring' });
  if (alerts.length === 0) alerts.push({ text: 'Всё работает штатно', severity: 'info' });

  const maxRevenue = Math.max(...trend.map((d: any) => d.revenue || 0), 1);

  if (loading) return (
    <div className="p-7">
      <div className="text-token-2xl font-extrabold text-neutral-900 mb-6">Dashboard</div>
      <div className="grid grid-cols-4 gap-3.5">
        {[1,2,3,4].map(i => <div key={i} className="h-[90px] bg-white rounded-token-lg animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="p-7 flex flex-col gap-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <h1 className="m-0 text-token-2xl font-extrabold text-neutral-900">Dashboard</h1>
        <span className="text-token-xs text-neutral-400">{new Date().toLocaleString('ru')}</span>
      </div>

      <AlertBanner items={alerts} onNavigate={onNavigate} />

      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <Kpi label="Тенантов" value={dash?.tenantsTotal ?? '—'} sub={`PRO: ${dash?.tenantsByPlan?.PRO ?? 0}  BIZ: ${dash?.tenantsByPlan?.BUSINESS ?? 0}`} />
        <Kpi label="Активных ботов" value={bots.length} sub={`Неактивных: ${failedBots.length}`} colorClass={failedBots.length > 0 ? 'text-danger' : undefined} />
        <Kpi label="Заказов за месяц" value={(dash?.ordersMonth ?? 0).toLocaleString()} />
        <Kpi label="Выручка (месяц)" value={`${((dash?.revenueMonth ?? 0) / 1_000_000).toFixed(1)}M`} sub="UZS" colorClass="text-success" />
        <Kpi label="Активных магазинов" value={dash?.activeStores ?? '—'} />
        <Kpi label="Инвойсов pending" value={pendingInvoices.length} colorClass={pendingInvoices.length > 0 ? 'text-warning' : undefined} />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <Card style={{ padding: '20px 20px 12px' }}>
          <div className="font-bold text-token-base mb-4 text-neutral-900">Выручка по месяцам (инвойсы PAID)</div>
          <div className="flex items-end gap-1.5" style={{ height: 110 }}>
            {trend.map((d: any) => {
              const pct = d.revenue / maxRevenue;
              const month = String(d.label || d.month || '').slice(5);
              return (
                <div key={d.label || d.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-[9px] text-neutral-400">{d.revenue > 0 ? `${(d.revenue/1_000_000).toFixed(1)}M` : ''}</span>
                  <div
                    title={`${d.label}: ${(d.revenue||0).toLocaleString()} UZS`}
                    className="w-full rounded-t"
                    style={{ height: `${Math.max(pct * 80, d.revenue > 0 ? 4 : 0)}px`, background: 'linear-gradient(180deg,#3b82f6,#1d4ed8)' }}
                  />
                  <span className="text-[10px] text-neutral-500">{month}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="overflow-y-auto max-h-[260px]" style={{ padding: 20 }}>
          <div className="font-bold text-token-base mb-3 text-neutral-900">Последние события</div>
          {activity.length === 0 && <p className="text-neutral-400 text-token-sm m-0">Нет событий</p>}
          {activity.map((a: any, i: number) => (
            <div key={a.id || i} className={`flex gap-2 pb-2 mb-2 ${i < activity.length - 1 ? 'border-b border-neutral-100' : ''}`}>
              <div className="flex-1">
                <div className="text-token-xs font-semibold text-neutral-700">{a.action}</div>
                <div className="text-[11px] text-neutral-400">{a.actorEmail} · {new Date(a.createdAt).toLocaleString('ru')}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {health && (
        <Card style={{ padding: '16px 20px' }}>
          <div className="font-bold text-token-base mb-3 text-neutral-900">Статус сервисов</div>
          <div className="flex gap-5 flex-wrap">
            {[
              { name: 'API', ok: true, sub: `${health.uptime ? Math.floor(health.uptime / 60) + 'мин' : '—'}` },
              { name: 'БД', ok: health.db?.ok !== false, sub: `${health.db?.latencyMs ?? '?'}ms` },
              { name: 'Redis', ok: health.redis?.ok !== false, sub: health.redis?.status || 'ok' },
              { name: 'Боты', ok: failedBots.length === 0, sub: `${bots.length} активных` },
            ].map(({ name, ok, sub }) => (
              <div key={name} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full inline-block ${ok ? 'bg-success shadow-[0_0_0_3px_rgba(34,197,94,0.2)]' : 'bg-danger shadow-[0_0_0_3px_rgba(239,68,68,0.2)]'}`} />
                <span className="font-bold text-token-sm text-neutral-700">{name}</span>
                <span className="text-token-xs text-neutral-400">{sub}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
