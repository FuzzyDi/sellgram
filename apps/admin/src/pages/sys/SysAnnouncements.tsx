import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

const FILTER_LABELS: Record<string, string> = {
  all:      'Все владельцы',
  pro:      'Только PRO',
  business: 'Только BUSINESS',
  active:   'Активные (заказы за 30 дней)',
};

export default function SysAnnouncements() {
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sentCount: number; failedCount: number; skipped: number } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 4000); }

  useEffect(() => {
    systemApi.announcements().then(setHistory).catch(() => {});
  }, []);

  async function send() {
    if (!message.trim()) return;
    if (!confirmed) { setConfirmed(true); return; }
    setSending(true);
    setResult(null);
    try {
      const data = await systemApi.sendAnnouncement(message.trim(), filter);
      setResult(data);
      showNotice(`✅ Отправлено: ${data.sentCount}, не доставлено: ${data.failedCount}`);
      setMessage('');
      setConfirmed(false);
      // refresh history
      systemApi.announcements().then(setHistory).catch(() => {});
    } catch (e: any) {
      showNotice('❌ ' + e.message);
      setConfirmed(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      {notice && <div style={{ position: 'fixed', top: 20, right: 20, background: notice.startsWith('✅') ? '#d1fae5' : '#fee2e2', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, color: notice.startsWith('✅') ? '#065f46' : '#991b1b', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>{notice}</div>}

      <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Объявления</h1>

      {/* Compose */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#0f172a' }}>📣 Отправить сообщение владельцам</div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
          Сообщение будет отправлено через Telegram-бот каждого магазина владельцу, у которого привязан adminTelegramId.
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Аудитория</label>
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setConfirmed(false); }}
            style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#f8fafc', width: '100%', maxWidth: 320 }}>
            {Object.entries(FILTER_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Текст сообщения (поддерживается HTML)
          </label>
          <textarea
            value={message}
            onChange={(e) => { setMessage(e.target.value); setConfirmed(false); }}
            rows={5}
            placeholder="Например: <b>🚀 Обновление SellGram!</b>&#10;&#10;Мы добавили новые функции..."
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'vertical', fontFamily: 'monospace', background: '#f8fafc' }}
          />
        </div>

        {confirmed && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#92400e' }}>
            ⚠️ Подтвердите отправку: сообщение будет разослано <strong>{FILTER_LABELS[filter]}</strong>. Нажмите кнопку ещё раз для подтверждения.
          </div>
        )}

        <button
          onClick={send}
          disabled={sending || !message.trim()}
          style={{
            background: confirmed ? '#ef4444' : '#3b82f6',
            color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px',
            fontWeight: 700, fontSize: 14, cursor: (sending || !message.trim()) ? 'not-allowed' : 'pointer',
            opacity: (sending || !message.trim()) ? 0.6 : 1,
          }}
        >
          {sending ? '⏳ Отправка...' : confirmed ? '⚠️ Подтвердить отправку' : '📤 Отправить'}
        </button>

        {result && (
          <div style={{ marginTop: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
            <strong style={{ color: '#065f46' }}>Результат:</strong>
            <span style={{ marginLeft: 12, color: '#374151' }}>✅ Доставлено: {result.sentCount}</span>
            <span style={{ marginLeft: 12, color: '#ef4444' }}>❌ Ошибок: {result.failedCount}</span>
            <span style={{ marginLeft: 12, color: '#94a3b8' }}>⏭️ Пропущено: {result.skipped}</span>
          </div>
        )}
      </div>

      {/* History */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 15 }}>
          История объявлений ({history.length})
        </div>
        {history.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Объявлений ещё не было</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {history.map((item: any) => (
              <div key={item.id} style={{ padding: '14px 18px', borderBottom: '1px solid #f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ background: '#eff6ff', color: '#1e40af', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                      {FILTER_LABELS[item.filter] || item.filter}
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>от {item.sentBy}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(item.sentAt).toLocaleString('ru')}</span>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                  {item.message}
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                  <span style={{ color: '#059669' }}>✅ {item.sentCount} доставлено</span>
                  {item.failedCount > 0 && <span style={{ color: '#dc2626' }}>❌ {item.failedCount} ошибок</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
