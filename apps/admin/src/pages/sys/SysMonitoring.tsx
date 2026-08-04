import React, { useEffect, useRef, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Badge from '../../components/Badge';
import Table, { TableColumn } from '../../components/Table';

function MonitorSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [draft, setDraft] = useState({ botToken: '', chatId: '', diskThreshold: 85 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  useEffect(() => {
    systemApi.monitorSettings().then((d: any) => {
      setSettings(d);
      setDraft({ botToken: d.botToken ?? '', chatId: d.chatId ?? '', diskThreshold: d.diskThreshold ?? 85 });
    });
  }, []);

  async function save() {
    setSaving(true); setSaveErr('');
    try {
      const updated = await systemApi.updateMonitorSettings({ ...draft, diskThreshold: Number(draft.diskThreshold) });
      setSettings(updated);
      setDraft({ botToken: updated.botToken ?? '', chatId: updated.chatId ?? '', diskThreshold: updated.diskThreshold ?? 85 });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setSaveErr(e?.message || 'Ошибка сохранения');
    } finally { setSaving(false); }
  }

  async function sendTest() {
    if (!draft.botToken || !draft.chatId) return;
    setTesting(true); setTestResult('');
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${draft.botToken}/sendMessage`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: draft.chatId, text: '✅ SellGram monitor — тест уведомления' }) }
      );
      const json = await res.json() as any;
      setTestResult(json.ok ? '✅ Сообщение отправлено' : '❌ ' + (json.description || 'Ошибка'));
    } catch (e: any) {
      setTestResult('❌ ' + (e?.message || 'Ошибка'));
    } finally { setTesting(false); }
  }

  if (!settings) return <div className="text-neutral-400 text-token-sm">Загрузка настроек...</div>;

  return (
    <Card className="mt-6" style={{ padding: '20px 22px' }}>
      <h2 className="mb-1 text-token-lg font-extrabold text-neutral-900">⚙️ Настройки уведомлений</h2>
      <p className="mb-4 text-token-xs text-neutral-500">Telegram-бот для healthcheck и disk-alert. Скрипт читает из API при каждом запуске.</p>

      <div className="flex flex-col gap-3 max-w-[480px]">
        <Input
          label="Токен бота"
          value={draft.botToken}
          onChange={e => setDraft(p => ({ ...p, botToken: e.target.value }))}
          placeholder="123456:ABC-DEF..."
          className="font-mono bg-neutral-50"
        />
        <Input
          label="Chat ID"
          value={draft.chatId}
          onChange={e => setDraft(p => ({ ...p, chatId: e.target.value }))}
          placeholder="-1001234567890"
          className="font-mono bg-neutral-50"
        />
        <div className="w-[100px]">
          <Input
            label="Порог диска (%)"
            type="number" min={50} max={99}
            value={draft.diskThreshold}
            onChange={e => setDraft(p => ({ ...p, diskThreshold: Number(e.target.value) }))}
            className="bg-neutral-50"
          />
        </div>
      </div>

      {saveErr && <p className="mt-2.5 text-danger text-token-xs">{saveErr}</p>}
      {saved && <p className="mt-2.5 text-success text-token-xs font-bold">✓ Сохранено</p>}

      <div className="flex gap-2.5 mt-4 flex-wrap items-center">
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </Button>
        <Button variant="secondary" onClick={() => void sendTest()} disabled={testing || !draft.botToken || !draft.chatId}>
          {testing ? 'Отправка...' : '📨 Тест уведомления'}
        </Button>
        {testResult && <span className={`text-token-xs ${testResult.startsWith('✅') ? 'text-success' : 'text-danger'}`}>{testResult}</span>}
      </div>
    </Card>
  );
}

function ServiceCard({ name, ok, metrics }: { name: string; ok: boolean; metrics: { label: string; value: string | number }[] }) {
  return (
    <Card style={{ padding: '16px 18px', borderLeft: `4px solid ${ok ? '#22c55e' : '#ef4444'}` }}>
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-3 h-3 rounded-full inline-block ${ok ? 'bg-success shadow-[0_0_0_3px_rgba(34,197,94,0.2)]' : 'bg-danger shadow-[0_0_0_3px_rgba(239,68,68,0.2)]'}`} />
        <span className="font-extrabold text-token-lg text-neutral-900">{name}</span>
        <span className={`ml-auto text-token-xs font-bold ${ok ? 'text-success' : 'text-danger'}`}>{ok ? 'OK' : 'ERR'}</span>
      </div>
      <div className="flex flex-col gap-1">
        {metrics.map(({ label, value }) => (
          <div key={label} className="flex justify-between text-token-xs">
            <span className="text-neutral-500">{label}</span>
            <span className="font-bold text-neutral-700">{value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatusDot({ code }: { code: number }) {
  const cls = code < 400 ? 'bg-success' : code < 500 ? 'bg-warning' : 'bg-danger';
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />;
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

  const botColumns: TableColumn<any>[] = [
    { key: 'status', header: '', width: 20, render: (b) => <span className={`w-2.5 h-2.5 rounded-full inline-block ${b.isActive ? 'bg-success' : 'bg-danger'}`} /> },
    { key: 'storeName', header: 'Магазин', render: (b) => <span className="font-semibold">{b.storeName}</span> },
    { key: 'username', header: 'Username', render: (b) => <span className="text-accent-600">{b.username ? `@${b.username}` : '—'}</span> },
    { key: 'tenantId', header: 'Tenant ID', render: (b) => <span className="font-mono text-[11px] text-neutral-400">{b.tenantId.slice(0, 16)}…</span> },
    { key: 'storeId', header: 'Store ID', render: (b) => <span className="font-mono text-[11px] text-neutral-400">{b.storeId.slice(0, 16)}…</span> },
  ];

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-5">
        <h1 className="m-0 text-token-2xl font-extrabold text-neutral-900">Мониторинг</h1>
        <div className="flex items-center gap-3">
          <span className="text-token-xs text-neutral-400">Обновлено: {lastRefresh.toLocaleTimeString('ru')}</span>
          <label className="flex items-center gap-1.5 text-token-sm cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Авто-обновление (15с)
          </label>
          <Button variant="primary" size="sm" onClick={loadAll}>🔄 Обновить</Button>
        </div>
      </div>

      {loading && <div className="text-neutral-400 text-token-base">Загрузка...</div>}

      {!loading && (
        <>
          <div className="grid gap-3.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
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

          <Card className="mb-6 overflow-hidden" style={{ padding: 0 }}>
            <div className="px-4 py-3.5 border-b border-neutral-100 font-bold text-token-lg flex justify-between items-center">
              <span>🤖 Зарегистрированные боты ({bots.length})</span>
              {bots.filter((b) => !b.isActive).length > 0 && (
                <Badge variant="danger">{bots.filter((b) => !b.isActive).length} неактивных</Badge>
              )}
            </div>
            <Table columns={botColumns} data={bots} rowKey={(b) => b.storeId} emptyMessage="Нет активных ботов" />
          </Card>

          <MonitorSettings />

          <Card className="overflow-hidden mt-6" style={{ padding: 0 }}>
            <div className="px-4 py-3.5 border-b border-neutral-100 font-bold text-token-lg flex justify-between items-center">
              <span>🔴 Лог ошибок (последние {errors.length})</span>
              <div className="flex gap-2">
                <Badge variant="warning">{error4xx} · 4xx</Badge>
                <Badge variant="danger">{error5xx} · 5xx</Badge>
              </div>
            </div>
            {errors.length === 0 ? (
              <div className="p-6 text-center text-neutral-400">Ошибок нет 🎉</div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full border-collapse text-token-xs">
                  <thead className="sticky top-0 bg-neutral-50 z-[1]">
                    <tr>
                      {['', 'Время', 'Код', 'Метод', 'URL', 'Tenant'].map((h) => (
                        <th key={h} className="px-3 py-1.5 text-left font-bold text-[11px] text-neutral-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((e: any, i: number) => (
                      <tr key={i} className="border-t border-neutral-50">
                        <td className="px-3 py-1.5"><StatusDot code={e.statusCode} /></td>
                        <td className="px-3 py-1.5 text-neutral-400 whitespace-nowrap">{new Date(e.time).toLocaleTimeString('ru')}</td>
                        <td className={`px-3 py-1.5 font-bold ${e.statusCode >= 500 ? 'text-danger' : 'text-warning'}`}>{e.statusCode}</td>
                        <td className="px-3 py-1.5 text-neutral-700">{e.method}</td>
                        <td className="px-3 py-1.5 font-mono text-neutral-600 max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap" title={e.url}>{e.url}</td>
                        <td className="px-3 py-1.5 text-neutral-400 font-mono text-[11px]">{e.tenantId ? e.tenantId.slice(0, 12) + '…' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
