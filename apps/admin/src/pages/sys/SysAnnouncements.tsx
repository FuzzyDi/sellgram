import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Select from '../../components/Select';
import Badge from '../../components/Badge';

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
    <div className="p-7">
      {notice && (
        <div className={`fixed top-5 right-5 rounded-token-md px-4 py-2.5 font-bold text-token-sm z-[999] shadow-lg ${notice.startsWith('✅') ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {notice}
        </div>
      )}

      <h1 className="mb-5 text-token-2xl font-extrabold text-neutral-900">Объявления</h1>

      <Card className="mb-6" style={{ padding: '20px 24px' }}>
        <div className="font-bold text-token-lg mb-4 text-neutral-900">📣 Отправить сообщение владельцам</div>
        <p className="mb-3.5 text-token-sm text-neutral-500">
          Сообщение будет отправлено через Telegram-бот каждого магазина владельцу, у которого привязан adminTelegramId.
        </p>

        <div className="mb-3 max-w-xs">
          <Select
            label="Аудитория"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setConfirmed(false); }}
          >
            {Object.entries(FILTER_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </Select>
        </div>

        <div className="mb-4">
          <label className="block text-token-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wide">
            Текст сообщения (поддерживается HTML)
          </label>
          <textarea
            value={message}
            onChange={(e) => { setMessage(e.target.value); setConfirmed(false); }}
            rows={5}
            placeholder={'Например: <b>🚀 Обновление SellGram!</b>\n\nМы добавили новые функции...'}
            className="w-full box-border border border-neutral-300 rounded-token-md px-3 py-2.5 text-token-sm resize-y font-mono bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
          />
        </div>

        {confirmed && (
          <div className="bg-warning/10 border border-warning/30 rounded-token-md px-4 py-3 mb-3 text-token-sm text-warning">
            ⚠️ Подтвердите отправку: сообщение будет разослано <strong>{FILTER_LABELS[filter]}</strong>. Нажмите кнопку ещё раз для подтверждения.
          </div>
        )}

        <Button
          variant={confirmed ? 'danger' : 'primary'}
          onClick={send}
          disabled={sending || !message.trim()}
        >
          {sending ? '⏳ Отправка...' : confirmed ? '⚠️ Подтвердить отправку' : '📤 Отправить'}
        </Button>

        {result && (
          <div className="mt-3.5 bg-success/10 border border-success/30 rounded-token-md px-4 py-3 text-token-sm">
            <strong className="text-success">Результат:</strong>
            <span className="ml-3 text-neutral-700">✅ Доставлено: {result.sentCount}</span>
            <span className="ml-3 text-danger">❌ Ошибок: {result.failedCount}</span>
            <span className="ml-3 text-neutral-400">⏭️ Пропущено: {result.skipped}</span>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden" style={{ padding: 0 }}>
        <div className="px-4 py-3.5 border-b border-neutral-100 font-bold text-token-lg">
          История объявлений ({history.length})
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-neutral-400">Объявлений ещё не было</div>
        ) : (
          <div className="flex flex-col">
            {history.map((item: any) => (
              <div key={item.id} className="px-4 py-3.5 border-b border-neutral-50 last:border-0">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex gap-2 items-center">
                    <Badge variant="info">{FILTER_LABELS[item.filter] || item.filter}</Badge>
                    <span className="text-token-xs text-neutral-400">от {item.sentBy}</span>
                  </div>
                  <span className="text-token-xs text-neutral-400">{new Date(item.sentAt).toLocaleString('ru')}</span>
                </div>
                <div className="bg-neutral-50 rounded-token-md px-3 py-2.5 font-mono text-token-xs text-neutral-700 whitespace-pre-wrap mb-2">
                  {item.message}
                </div>
                <div className="flex gap-3.5 text-token-xs">
                  <span className="text-success">✅ {item.sentCount} доставлено</span>
                  {item.failedCount > 0 && <span className="text-danger">❌ {item.failedCount} ошибок</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
