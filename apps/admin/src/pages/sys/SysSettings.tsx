import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

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

  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      {notice && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: notice.startsWith('✅') ? '#d1fae5' : '#fee2e2', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, color: notice.startsWith('✅') ? '#065f46' : '#991b1b', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>{notice}</div>
      )}

      <h1 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Настройки системы</h1>

      {loading && <div style={{ color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>}

      {!loading && (
        <>
          {/* Runtime info */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#0f172a' }}>🖥️ Runtime</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {[
                { label: 'Node.js', value: runtime.node || '—' },
                { label: 'Uptime', value: uptimeStr },
                { label: 'Memory (RSS)', value: runtime.memoryMb ? `${runtime.memoryMb} MB` : '—' },
                { label: 'DB', value: health?.db?.ok !== false ? `OK (${health?.db?.latencyMs}ms)` : 'ERROR' },
                { label: 'Redis', value: health?.redis?.ok !== false ? 'OK' : 'ERROR' },
                { label: 'Статус', value: health?.status || '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Queue status */}
          {Object.keys(queues).length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#0f172a' }}>📋 Очереди BullMQ</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Очередь', 'Ожидают', 'Активные', 'Ошибки'].map((h) => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(queues).map(([name, q]: [string, any]) => (
                    <tr key={name} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 600 }}>{name}</td>
                      <td style={{ padding: '8px 14px' }}>{q.waiting ?? '—'}</td>
                      <td style={{ padding: '8px 14px' }}>{q.active ?? '—'}</td>
                      <td style={{ padding: '8px 14px', color: q.failed > 0 ? '#dc2626' : '#94a3b8', fontWeight: q.failed > 0 ? 700 : 400 }}>{q.failed ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Subscription reminder settings */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: '#0f172a' }}>🔔 Напоминания об истечении подписки</div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
              Автоматические уведомления владельцам магазинов о скором истечении плана.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(e) => setReminderEnabled(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 600 }}>Включить напоминания</span>
              </label>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  За сколько дней уведомлять (через запятую)
                </label>
                <input
                  value={reminderDays}
                  onChange={(e) => setReminderDays(e.target.value)}
                  disabled={!reminderEnabled}
                  placeholder="7, 3, 1"
                  style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: 220, background: reminderEnabled ? '#fff' : '#f8fafc', color: reminderEnabled ? '#0f172a' : '#94a3b8' }}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Например: 7, 3, 1 — уведомление за 7, 3 и 1 день до истечения</div>
              </div>

              <div>
                <button
                  onClick={saveReminders}
                  disabled={saving}
                  style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>

            {reminders && (
              <div style={{ marginTop: 14, fontSize: 12, color: '#94a3b8' }}>
                Текущие значения: {reminders.enabled ? `✅ включено, дни: ${(reminders.days || []).join(', ')}` : '❌ отключено'}
              </div>
            )}
          </div>

          {/* Counters */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#0f172a' }}>📊 Счётчики системы</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {[
                { label: 'Тенантов', value: health?.counters?.tenants ?? '—' },
                { label: 'Активных магазинов', value: health?.counters?.activeStores ?? '—' },
                { label: 'Инвойсов PENDING', value: health?.counters?.pendingInvoices ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
