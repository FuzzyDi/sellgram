import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import type { SysPage } from './SysLayout';

function Kpi({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || '#0f172a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AlertBanner({ items, onNavigate }: { items: { text: string; severity: 'error' | 'warn' | 'info'; page?: SysPage }[]; onNavigate: (p: SysPage) => void }) {
  if (items.length === 0) return null;
  const colors = { error: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', dot: '#ef4444' }, warn: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', dot: '#f59e0b' }, info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', dot: '#3b82f6' } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, i) => {
        const c = colors[item.severity];
        return (
          <div key={i} onClick={() => item.page && onNavigate(item.page)}
            style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: item.page ? 'pointer' : 'default' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ color: c.text, fontSize: 13, fontWeight: 600 }}>{item.text}</span>
            {item.page && <span style={{ marginLeft: 'auto', color: c.dot, fontSize: 12 }}>→</span>}
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
    ]).finally(() => setLoading(false));
  }, []);

  const alerts: { text: string; severity: 'error' | 'warn' | 'info'; page?: SysPage }[] = [];
  if (pendingInvoices.length > 0) alerts.push({ text: `${pendingInvoices.length} инвойс(ов) ожидают подтверждения`, severity: 'warn', page: 'invoices' });
  if (dash?.expiringPlans > 0) {
    alerts.push({ text: `${dash.expiringPlans} план(ов) истекает в течение 7 дней`, severity: 'warn', page: 'tenants' });
  }
  const failedBots = bots.filter((b) => !b.isActive);
  if (failedBots.length > 0) alerts.push({ text: `${failedBots.length} бот(ов) неактивны`, severity: 'error', page: 'monitoring' });
  if (health && health.db?.latencyMs > 200) alerts.push({ text: `Высокая задержка БД: ${health.db.latencyMs}ms`, severity: 'warn', page: 'monitoring' });
  if (alerts.length === 0) alerts.push({ text: 'Всё работает штатно', severity: 'info' });

  const maxRevenue = Math.max(...trend.map((d: any) => d.revenue || 0), 1);

  if (loading) return (
    <div style={{ padding: 28 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 24 }}>Dashboard</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[1,2,3,4].map(i => <div key={i} style={{ height: 90, background: '#fff', borderRadius: 12 }} className="sg-skeleton" />)}
      </div>
    </div>
  );

  return (
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Dashboard</h1>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{new Date().toLocaleString('ru')}</span>
      </div>

      {/* Alerts */}
      <AlertBanner items={alerts} onNavigate={onNavigate} />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        <Kpi label="Тенантов" value={dash?.tenantsTotal ?? '—'} sub={`PRO: ${dash?.tenantsByPlan?.PRO ?? 0}  BIZ: ${dash?.tenantsByPlan?.BUSINESS ?? 0}`} />
        <Kpi label="Активных ботов" value={bots.length} sub={`Неактивных: ${failedBots.length}`} color={failedBots.length > 0 ? '#ef4444' : undefined} />
        <Kpi label="Заказов за месяц" value={(dash?.ordersMonth ?? 0).toLocaleString()} />
        <Kpi label="Выручка (месяц)" value={`${((dash?.revenueMonth ?? 0) / 1_000_000).toFixed(1)}M`} sub="UZS" color="#059669" />
        <Kpi label="Активных магазинов" value={dash?.activeStores ?? '—'} />
        <Kpi label="Инвойсов pending" value={pendingInvoices.length} color={pendingInvoices.length > 0 ? '#f59e0b' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        {/* Revenue chart */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 20px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: '#0f172a' }}>Выручка по месяцам (инвойсы PAID)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
            {trend.map((d: any) => {
              const pct = d.revenue / maxRevenue;
              const month = String(d.label || d.month || '').slice(5);
              return (
                <div key={d.label || d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 9, color: '#9ca3af' }}>{d.revenue > 0 ? `${(d.revenue/1_000_000).toFixed(1)}M` : ''}</span>
                  <div title={`${d.label}: ${(d.revenue||0).toLocaleString()} UZS`}
                    style={{ width: '100%', borderRadius: '4px 4px 0 0', height: `${Math.max(pct * 80, d.revenue > 0 ? 4 : 0)}px`, background: 'linear-gradient(180deg,#3b82f6,#1d4ed8)' }} />
                  <span style={{ fontSize: 10, color: '#6b7280' }}>{month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent activity */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflowY: 'auto', maxHeight: 260 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#0f172a' }}>Последние события</div>
          {activity.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Нет событий</p>}
          {activity.map((a: any, i: number) => (
            <div key={a.id || i} style={{ display: 'flex', gap: 8, paddingBottom: 8, marginBottom: 8, borderBottom: i < activity.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{a.action}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.actorEmail} · {new Date(a.createdAt).toLocaleString('ru')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Health quick-view */}
      {health && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#0f172a' }}>Статус сервисов</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { name: 'API', ok: true, sub: `${health.uptime ? Math.floor(health.uptime / 60) + 'мин' : '—'}` },
              { name: 'БД', ok: health.db?.ok !== false, sub: `${health.db?.latencyMs ?? '?'}ms` },
              { name: 'Redis', ok: health.redis?.ok !== false, sub: health.redis?.status || 'ok' },
              { name: 'Боты', ok: failedBots.length === 0, sub: `${bots.length} активных` },
            ].map(({ name, ok, sub }) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444', display: 'inline-block', boxShadow: `0 0 0 3px ${ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>{name}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
