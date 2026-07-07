import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Badge from '../../components/Badge';
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
      <div className="border border-neutral-200 rounded-token-lg overflow-hidden divide-y divide-neutral-200">
        {[1, 2].map((i) => (
          <div key={i} className="p-3.5">
            <div className="h-4 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse" />
            <div className="h-3 w-1/4 rounded-token-sm bg-neutral-100 animate-pulse mt-1.5" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <Card>
        <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Webhooks', 'Webhooks')}</h3>
        <p className="text-token-sm text-neutral-500">{tr('Получайте события заказов на ваш URL в реальном времени.', 'Buyurtma voqealarini real vaqtda URL manzilingizga oling.')}</p>
        <p className="mt-1.5 text-token-xs text-neutral-400 leading-relaxed">
          {tr(
            'При каждом событии SellGram делает POST-запрос на ваш URL. Если сервер не ответил 2xx — одна повторная попытка через 3 секунды. Подпись запроса передаётся в заголовке X-Sellgram-Signature: sha256=...',
            "Har bir voqeada SellGram URL manzilingizga POST so'rov yuboradi. Server 2xx javob bermasa — 3 soniyadan so'ng bitta qayta urinish. So'rov imzosi X-Sellgram-Signature: sha256=... sarlavhasida uzatiladi."
          )}
        </p>

        {newWebhookSecret && (
          <Card className="mt-3 bg-success/5 border-success/30">
            <p className="m-0 font-semibold text-success">{tr('Секрет для верификации подписи (сохраните):', 'Imzo tekshirish siri (saqlang):')}</p>
            <p className="mt-2 mb-0 font-mono text-token-sm break-all text-neutral-800">{newWebhookSecret}</p>
            <p className="mt-1.5 mb-0 text-token-xs text-neutral-500">{tr('Заголовок: X-Sellgram-Signature: sha256=HMAC_SHA256(body, secret)', 'Sarlavha: X-Sellgram-Signature: sha256=HMAC_SHA256(body, secret)')}</p>
            <Button variant="ghost" size="sm" type="button" className="mt-2" onClick={onCloseSecret}>{tr('Закрыть', 'Yopish')}</Button>
          </Card>
        )}

        <Card className="mt-3 bg-neutral-50">
          <Input
            value={webhookForm.url}
            onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
            placeholder="https://your-server.com/webhook"
          />
          <div className="flex gap-2.5 mt-2 flex-wrap">
            {ALL_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-token-sm text-neutral-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent-600"
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
          <div className="mt-3">
            <Button
              variant="primary"
              size="md"
              type="button"
              disabled={saving || !webhookForm.url.trim() || webhookForm.events.length === 0}
              onClick={() => void createWebhook()}
            >
              {saving ? '...' : tr('Добавить вебхук', "Webhook qo'shish")}
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-2 mt-3">
          {webhooks.map((hook) => (
            <Card key={hook.id} className="bg-neutral-50 p-2.5">
              <div className="flex items-start justify-between gap-2.5 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-token-sm font-semibold break-all text-neutral-800">{hook.url}</div>
                  <div className="flex items-center gap-1.5 mt-1 text-token-xs text-neutral-500">
                    <span>{(hook.events as string[]).join(', ')}</span>
                    <Badge variant={hook.isActive ? 'success' : 'neutral'}>
                      {hook.isActive ? tr('активен', 'faol') : tr('отключён', "o'chirilgan")}
                    </Badge>
                  </div>
                </div>
                {pendingDeleteWebhook === hook.id ? (
                  <div className="flex gap-2 items-center flex-shrink-0">
                    <span className="text-token-xs font-medium text-warning">{tr('Удалить?', "O'chirish?")}</span>
                    <Button variant="danger" size="sm" type="button" onClick={() => void deleteWebhook(hook.id)}>{tr('Да', 'Ha')}</Button>
                    <Button variant="ghost" size="sm" type="button" onClick={() => setPendingDeleteWebhook(null)}>{tr('Отмена', 'Bekor')}</Button>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="ghost" size="sm" type="button" onClick={() => void toggleWebhook(hook)}>
                      {hook.isActive ? tr('Откл.', "O'ch.") : tr('Вкл.', 'Yoq.')}
                    </Button>
                    <Button variant="danger" size="sm" type="button" onClick={() => setPendingDeleteWebhook(hook.id)}>
                      {tr('Удалить', "O'chirish")}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {webhooks.length === 0 && <p className="text-token-sm text-neutral-500">{tr('Вебхуков нет', "Webhooklar yo'q")}</p>}
        </div>
      </Card>
    </section>
  );
}
