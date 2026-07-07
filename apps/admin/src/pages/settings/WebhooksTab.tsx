import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { TabProps } from './types';

const ALL_EVENTS = ['order.created', 'order.status_changed', 'order.paid', 'customer.created'];

// newWebhookSecret/refreshKey are lifted to Settings.tsx and shared with
// CrmTab — the original file's "quick connect" on the CRM tab creates a
// webhook, then switches to this tab to show its secret (Settings.tsx:
// setTab('webhooks') after adminApi.createWebhook() — the one genuine
// cross-tab coupling in the whole file). refreshKey lets this tab
// re-fetch even if it was already mounted/cached before CRM created the
// new entry.
interface WebhooksTabProps extends TabProps {
  newWebhookSecret: string | null;
  onCloseSecret: () => void;
  refreshKey: number;
}

export default function WebhooksTab({ onNotice, newWebhookSecret, onCloseSecret, refreshKey }: WebhooksTabProps) {
  const { tr } = useAdminI18n();
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ url: '', events: [...ALL_EVENTS] as string[] });
  const [pendingDeleteWebhook, setPendingDeleteWebhook] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const hookList = await adminApi.getWebhooks().catch(() => []);
      setWebhooks(Array.isArray(hookList) ? hookList : []);
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка при загрузке настроек', 'Sozlamalarni yuklashda xato'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function createWebhook() {
    if (!webhookForm.url.trim() || webhookForm.events.length === 0 || saving) return;
    setSaving(true);
    try {
      await adminApi.createWebhook({ url: webhookForm.url.trim(), events: webhookForm.events });
      setWebhookForm({ url: '', events: [...ALL_EVENTS] });
      await load();
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleWebhook(hook: any) {
    try {
      await adminApi.updateWebhook(hook.id, { isActive: !hook.isActive });
      await load();
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function deleteWebhook(id: string) {
    setPendingDeleteWebhook(null);
    try {
      await adminApi.deleteWebhook(id);
      await load();
      onNotice('success', tr('Вебхук удалён', "Webhook o'chirildi"));
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #edf2ee' }}>
              <div style={{ flex: 1 }}>
                <div className="sg-skeleton" style={{ height: 16, width: '40%' }} />
                <div className="sg-skeleton" style={{ height: 12, width: '25%', marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="sg-grid" style={{ gap: 10 }}>
      <article className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Webhooks', 'Webhooks')}</h3>
        <p className="sg-subtitle">{tr('Получайте события заказов на ваш URL в реальном времени.', 'Buyurtma voqealarini real vaqtda URL manzilingizga oling.')}</p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#748278', lineHeight: 1.6 }}>
          {tr(
            'При каждом событии SellGram делает POST-запрос на ваш URL. Если сервер не ответил 2xx — одна повторная попытка через 3 секунды. Подпись запроса передаётся в заголовке X-Sellgram-Signature: sha256=...',
            "Har bir voqeada SellGram URL manzilingizga POST so'rov yuboradi. Server 2xx javob bermasa — 3 soniyadan so'ng bitta qayta urinish. So'rov imzosi X-Sellgram-Signature: sha256=... sarlavhasida uzatiladi."
          )}
        </p>

        {newWebhookSecret && (
          <div className="sg-card" style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #86efac' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#065f46' }}>{tr('Секрет для верификации подписи (сохраните):', 'Imzo tekshirish siri (saqlang):')}</p>
            <p style={{ margin: '8px 0 0', fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>{newWebhookSecret}</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>{tr('Заголовок: X-Sellgram-Signature: sha256=HMAC_SHA256(body, secret)', 'Sarlavha: X-Sellgram-Signature: sha256=HMAC_SHA256(body, secret)')}</p>
            <button className="sg-btn ghost" type="button" style={{ marginTop: 8, fontSize: 12 }} onClick={onCloseSecret}>{tr('Закрыть', 'Yopish')}</button>
          </div>
        )}

        <div className="sg-card soft" style={{ marginTop: 10 }}>
          <input
            value={webhookForm.url}
            onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
            placeholder="https://your-server.com/webhook"
            style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {ALL_EVENTS.map((ev) => (
              <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={webhookForm.events.includes(ev)}
                  onChange={(e) => setWebhookForm({
                    ...webhookForm,
                    events: e.target.checked
                      ? [...webhookForm.events, ev]
                      : webhookForm.events.filter((x) => x !== ev),
                  })}
                />
                {ev}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              className="sg-btn primary"
              type="button"
              disabled={saving || !webhookForm.url.trim() || webhookForm.events.length === 0}
              onClick={() => void createWebhook()}
            >
              {saving ? '...' : tr('Добавить вебхук', "Webhook qo'shish")}
            </button>
          </div>
        </div>

        <div className="sg-grid" style={{ gap: 8, marginTop: 10 }}>
          {webhooks.map((hook) => (
            <div key={hook.id} className="sg-card soft" style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, wordBreak: 'break-all' }}>{hook.url}</div>
                  <div style={{ fontSize: 12, color: '#6b7a71', marginTop: 4 }}>
                    {(hook.events as string[]).join(', ')}
                    {' · '}
                    {hook.isActive ? tr('активен', 'faol') : tr('отключён', "o'chirilgan")}
                  </div>
                </div>
                {pendingDeleteWebhook === hook.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>{tr('Удалить?', "O'chirish?")}</span>
                    <button className="sg-btn danger" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => void deleteWebhook(hook.id)}>{tr('Да', 'Ha')}</button>
                    <button className="sg-btn ghost" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setPendingDeleteWebhook(null)}>{tr('Отмена', 'Bekor')}</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="sg-btn ghost" type="button" style={{ padding: '5px 12px', fontSize: 13 }} onClick={() => void toggleWebhook(hook)}>
                      {hook.isActive ? tr('Откл.', "O'ch.") : tr('Вкл.', 'Yoq.')}
                    </button>
                    <button className="sg-btn danger" type="button" style={{ padding: '5px 12px', fontSize: 13 }} onClick={() => setPendingDeleteWebhook(hook.id)}>
                      {tr('Удалить', "O'chirish")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {webhooks.length === 0 && <p className="sg-subtitle">{tr('Вебхуков нет', "Webhooklar yo'q")}</p>}
        </div>
      </article>
    </section>
  );
}
