import React, { useEffect, useRef, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

function ServiceCard({ name, ok, metrics }: { name: string; ok: boolean; metrics: { label: string; value: string | number }[] }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${ok ? '#22c55e' : '#ef4444'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444', display: 'inline-block', boxShadow: `0 0 0 3px ${ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }} />
        <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: ok ? '#059669' : '#dc2626' }}>{ok ? 'OK' : 'ERR'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {metrics.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#64748b' }}>{label}</span>
            <span style={{ fontWeight: 700, color: '#374151' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ code }: { code: number }) {
  const color = code < 400 ? '#22c55e' : code < 500 ? '#f59e0b' : '#ef4444';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

export default function SysMonitoring() {
  const [health, setHealth] = useState<any>(null);
  const [bots, setBots] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [storage, setStorage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function loadAll() {
    Promise.allSettled([
      systemApi.health().then(setHealth),
      systemApi.bots().then(setBots),
      systemApi.errors(100).then(setErrors),
      systemApi.storage().then(setStorage),
    ]).finally(() => { setLoading(false); setLastRefresh(new Date()); });
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(loadAll, 15_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh]);

  const uptimeSec = health?.runtime?.uptimeSec ?? 0;
  const uptime = uptimeSec > 0 ? `${Math.floor(uptimeSec / 3600)}ч ${Math.floor((uptimeSec % 3600) / 60)}м` : '—';
  const memMb = health?.runtime?.memoryMb ?? null;

  const error4xx = errors.filter((e) => e.statusCode >= 400 && e.statusCode < 500).length;
  const error5xx = errors.filter((e) => e.statusCode >= 500).length;

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Мониторинг</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Обновлено: {lastRefresh.toLocaleTimeString('ru')}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Авто-обновление (15с)
          </label>
          <button onClick={loadAll} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            🔄 Обновить
          </button>
        </div>
      </div>

      {loading && <div style={{ color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>}

      {!loading && (
        <>
          {/* Services */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
            <ServiceCard name="API" ok={true} metrics={[
              { label: 'Uptime', value: uptime },
              { label: 'Память', value: memMb ? `${memMb} MB` : '—' },
              { label: '4xx (последние 100)', value: error4xx },
              { label: '5xx (последние 100)', value: error5xx },
            ]} />
            <ServiceCard name="База данных" ok={health?.db?.ok !== false} metrics={[
              { label: 'Latency', value: health?.db?.latencyMs != null ? `${health.db.latencyMs}ms` : '—' },
              { label: 'Статус', value: health?.db?.ok !== false ? 'connected' : 'error' },
            ]} />
            <ServiceCard name="Redis" ok={health?.redis?.ok !== false} metrics={[
              { label: 'Статус', value: health?.redis?.status || (health?.redis?.ok !== false ? 'ok' : 'error') },
              { label: 'broadcast wait', value: health?.queues?.broadcast?.waiting ?? '—' },
              { label: 'daily-digest wait', value: health?.queues?.['daily-digest']?.waiting ?? '—' },
            ]} />
            <ServiceCard name="MinIO / Storage" ok={true} metrics={[
              { label: 'Бакет', value: storage?.bucket || '—' },
              { label: 'Файлов', value: storage?.fileCount ?? '—' },
              { label: 'Занято', value: storage?.totalMb != null ? `${storage.totalMb} MB` : '—' },
            ]} />
          </div>

          {/* Bots */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🤖 Зарегистрированные боты ({bots.length})</span>
              {bots.filter((b) => !b.isActive).length > 0 && (
                <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
                  {bots.filter((b) => !b.isActive).length} неактивных
                </span>
              )}
            </div>
            {bots.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Нет активных ботов</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['', 'Магазин', 'Username', 'Tenant ID', 'Store ID'].map((h) => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bots.map((b: any) => (
                    <tr key={b.storeId} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 14px', width: 20 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: b.isActive ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                      </td>
                      <td style={{ padding: '8px 14px', fontWeight: 600 }}>{b.storeName}</td>
                      <td style={{ padding: '8px 14px', color: '#3b82f6' }}>{b.username ? `@${b.username}` : '—'}</td>
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{b.tenantId.slice(0, 16)}…</td>
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{b.storeId.slice(0, 16)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Error log */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🔴 Лог ошибок (последние {errors.length})</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>{error4xx} · 4xx</span>
                <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>{error5xx} · 5xx</span>
              </div>
            </div>
            {errors.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Ошибок нет 🎉</div>
            ) : (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                    <tr>
                      {['', 'Время', 'Код', 'Метод', 'URL', 'Tenant'].map((h) => (
                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((e: any, i: number) => (
                      <tr key={i} style={{ borderTop: '1px solid #f8fafc' }}>
                        <td style={{ padding: '6px 12px' }}><StatusDot code={e.statusCode} /></td>
                        <td style={{ padding: '6px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(e.time).toLocaleTimeString('ru')}</td>
                        <td style={{ padding: '6px 12px', fontWeight: 700, color: e.statusCode >= 500 ? '#dc2626' : '#d97706' }}>{e.statusCode}</td>
                        <td style={{ padding: '6px 12px', color: '#374151' }}>{e.method}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'monospace', color: '#475569', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.url}>{e.url}</td>
                        <td style={{ padding: '6px 12px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>{e.tenantId ? e.tenantId.slice(0, 12) + '…' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
