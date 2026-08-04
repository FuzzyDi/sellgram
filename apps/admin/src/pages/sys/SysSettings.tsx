import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Table, { TableColumn } from '../../components/Table';

const SECTION_PADDING = { padding: '20px 24px' };

export default function SysSettings() {
  const [health, setHealth] = useState<any>(null);
  const [reminders, setReminders] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDays, setReminderDays] = useState('7,3,1');

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  useEffect(() => {
    Promise.allSettled([
      systemApi.health().then(setHealth),
      systemApi.reminderSettings().then((r) => {
        setReminders(r);
        setReminderEnabled(r?.enabled ?? true);
        setReminderDays((r?.days || [7, 3, 1]).join(', '));
      }),
    ]).finally(() => setLoading(false));
  }, []);

  async function saveReminders() {
    setSaving(true);
    try {
      const days = reminderDays.split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => !isNaN(d) && d > 0);
      await systemApi.updateReminderSettings({ enabled: reminderEnabled, days });
      showNotice('✅ Настройки сохранены');
    } catch (e: any) {
      showNotice('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const runtime = health?.runtime || {};
  const uptimeSec = runtime.uptimeSec ?? 0;
  const uptimeStr = uptimeSec > 0 ? `${Math.floor(uptimeSec / 3600)}ч ${Math.floor((uptimeSec % 3600) / 60)}м` : '—';
  const queues = health?.queues || {};

  const queueColumns: TableColumn<[string, any]>[] = [
    { key: 'name', header: 'Очередь', render: ([name]) => <span className="font-semibold">{name}</span> },
    { key: 'waiting', header: 'Ожидают', render: ([, q]) => q.waiting ?? '—' },
    { key: 'active', header: 'Активные', render: ([, q]) => q.active ?? '—' },
    {
      key: 'failed',
      header: 'Ошибки',
      render: ([, q]) => (
        <span className={q.failed > 0 ? 'text-danger font-bold' : 'text-neutral-400'}>{q.failed ?? '—'}</span>
      ),
    },
  ];

  return (
    <div className="p-7 max-w-[900px]">
      {notice && (
        <div className={`fixed top-5 right-5 rounded-token-md px-4 py-2.5 font-bold text-token-sm z-[999] shadow-lg ${notice.startsWith('✅') ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {notice}
        </div>
      )}

      <h1 className="mb-6 text-token-2xl font-extrabold text-neutral-900">Настройки системы</h1>

      {loading && <div className="text-neutral-400 text-token-base">Загрузка...</div>}

      {!loading && (
        <>
          <Card className="mb-5" style={SECTION_PADDING}>
            <div className="font-bold text-token-lg mb-4 text-neutral-900">🖥️ Runtime</div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {[
                { label: 'Node.js', value: runtime.node || '—' },
                { label: 'Uptime', value: uptimeStr },
                { label: 'Memory (RSS)', value: runtime.memoryMb ? `${runtime.memoryMb} MB` : '—' },
                { label: 'DB', value: health?.db?.ok !== false ? `OK (${health?.db?.latencyMs}ms)` : 'ERROR' },
                { label: 'Redis', value: health?.redis?.ok !== false ? 'OK' : 'ERROR' },
                { label: 'Статус', value: health?.status || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-neutral-50 rounded-token-md px-3.5 py-3">
                  <div className="text-token-xs text-neutral-500 font-semibold uppercase tracking-wide mb-1">{label}</div>
                  <div className="text-token-base font-bold text-neutral-900">{value}</div>
                </div>
              ))}
            </div>
          </Card>

          {Object.keys(queues).length > 0 && (
            <Card className="mb-5" style={SECTION_PADDING}>
              <div className="font-bold text-token-lg mb-4 text-neutral-900">📋 Очереди BullMQ</div>
              <Table columns={queueColumns} data={Object.entries(queues)} rowKey={([name]) => name} />
            </Card>
          )}

          <Card className="mb-5" style={SECTION_PADDING}>
            <div className="font-bold text-token-lg mb-1 text-neutral-900">🔔 Напоминания об истечении подписки</div>
            <p className="mb-4 text-token-sm text-neutral-500">
              Автоматические уведомления владельцам магазинов о скором истечении плана.
            </p>

            <div className="flex flex-col gap-3.5">
              <label className="flex items-center gap-2.5 text-token-base cursor-pointer">
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(e) => setReminderEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="font-semibold">Включить напоминания</span>
              </label>

              <div className="max-w-[220px]">
                <Input
                  label="За сколько дней уведомлять (через запятую)"
                  value={reminderDays}
                  onChange={(e) => setReminderDays(e.target.value)}
                  disabled={!reminderEnabled}
                  placeholder="7, 3, 1"
                  helpText="Например: 7, 3, 1 — уведомление за 7, 3 и 1 день до истечения"
                />
              </div>

              <div>
                <Button variant="primary" onClick={saveReminders} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </div>
            </div>

            {reminders && (
              <div className="mt-3.5 text-token-xs text-neutral-400">
                Текущие значения: {reminders.enabled ? `✅ включено, дни: ${(reminders.days || []).join(', ')}` : '❌ отключено'}
              </div>
            )}
          </Card>

          <Card style={SECTION_PADDING}>
            <div className="font-bold text-token-lg mb-4 text-neutral-900">📊 Счётчики системы</div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {[
                { label: 'Тенантов', value: health?.counters?.tenants ?? '—' },
                { label: 'Активных магазинов', value: health?.counters?.activeStores ?? '—' },
                { label: 'Инвойсов PENDING', value: health?.counters?.pendingInvoices ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-neutral-50 rounded-token-md px-3.5 py-3">
                  <div className="text-token-xs text-neutral-500 font-semibold uppercase tracking-wide mb-1">{label}</div>
                  <div className="text-token-2xl font-extrabold text-neutral-900">{value}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
