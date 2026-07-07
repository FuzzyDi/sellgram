import React, { useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { TabProps } from './types';

// No data to load on mount — this tab is purely instructions + a
// "quick connect" form that creates a webhook, then hands the secret
// back to Settings.tsx to display on the Webhooks tab (see
// WebhooksTab.tsx's comment — the one genuine cross-tab coupling in the
// original file).
interface CrmTabProps extends TabProps {
  onWebhookCreated: (secret: string) => void;
}

export default function CrmTab({ onNotice, onWebhookCreated }: CrmTabProps) {
  const { tr } = useAdminI18n();
  const [crmUrl, setCrmUrl] = useState('');
  const [crmSaving, setCrmSaving] = useState(false);

  return (
    <section className="sg-grid" style={{ gap: 12 }}>
      <article className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('CRM интеграция', 'CRM integratsiya')}</h3>
        <p className="sg-subtitle">
          {tr(
            'Подключите Bitrix24 или AmoCRM — новые клиенты и заказы будут автоматически попадать в CRM.',
            'Bitrix24 yoki AmoCRM ulang — yangi mijozlar va buyurtmalar avtomatik CRM-ga tushadi.'
          )}
        </p>

        {/* Quick connect */}
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            {tr('URL входящего вебхука CRM', 'CRM kiruvchi webhook URL')}
          </label>
          <input
            value={crmUrl}
            onChange={(e) => setCrmUrl(e.target.value)}
            placeholder="https://your-crm.bitrix24.ru/rest/..."
            style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}
          />
          <button
            className="sg-btn primary"
            type="button"
            disabled={crmSaving || !crmUrl.trim()}
            onClick={async () => {
              if (!crmUrl.trim()) return;
              setCrmSaving(true);
              try {
                const data = await adminApi.createWebhook({
                  url: crmUrl.trim(),
                  events: ['order.created', 'order.status_changed', 'order.paid', 'customer.created'],
                });
                setCrmUrl('');
                onWebhookCreated(data.secret);
                onNotice('success', tr('CRM подключена — вебхук создан', 'CRM ulandi — webhook yaratildi'));
              } catch (e: any) {
                onNotice('error', e.message || tr('Ошибка', 'Xatolik'));
              } finally {
                setCrmSaving(false);
              }
            }}
          >
            {crmSaving ? tr('Подключение...', 'Ulanmoqda...') : tr('Подключить CRM', 'CRM ulash')}
          </button>
        </div>
      </article>

      {/* Bitrix24 instructions */}
      <article className="sg-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Bitrix24</div>
            <div style={{ fontSize: 12, color: '#748278' }}>{tr('Входящий вебхук REST API', 'Kiruvchi webhook REST API')}</div>
          </div>
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          <li>{tr('Перейдите в Bitrix24 → Приложения → Вебхуки → Входящий вебхук', 'Bitrix24 → Ilovalar → Webhooklar → Kiruvchi webhook')}</li>
          <li>{tr('Скопируйте URL вида', 'Quyidagi URL-ni nusxalang:')} <code style={{ background: '#f3f4f6', borderRadius: 4, padding: '1px 5px', fontSize: 12 }}>https://ДОМЕН.bitrix24.ru/rest/ПОЛЬЗОВАТЕЛЬ/ТОКЕН/</code></li>
          <li>{tr('Вставьте в поле URL выше и нажмите «Подключить»', 'Yuqoridagi URL maydoniga joylashtiring va "Ulash" tugmasini bosing')}</li>
          <li>{tr('SellGram будет отправлять события order.* и customer.created на этот URL', 'SellGram order.* va customer.created voqealarini ushbu URL ga yuboradi')}</li>
        </ol>
        <div style={{ marginTop: 10, background: '#fefce8', border: '1px solid #fde047', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#713f12' }}>
          {tr(
            "Bitrix24 REST не принимает вебхуки напрямую — настройте обработчик (например через n8n, Make или собственный сервер).",
            "Bitrix24 REST webhooklarni to'g'ridan-to'g'ri qabul qilmaydi — n8n, Make yoki o'z serveringiz orqali sozlang."
          )}
        </div>
      </article>

      {/* AmoCRM instructions */}
      <article className="sg-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>🔗</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>AmoCRM</div>
            <div style={{ fontSize: 12, color: '#748278' }}>{tr('Через n8n / Make / Zapier', 'n8n / Make / Zapier orqali')}</div>
          </div>
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          <li>{tr('Создайте сценарий в n8n/Make с триггером Webhook', "n8n/Make'da Webhook trigger bilan stsenariy yarating")}</li>
          <li>{tr('Скопируйте URL триггера и вставьте в поле выше', 'Trigger URL-ni nusxalab yuqoridagi maydonga joylashtiring')}</li>
          <li>{tr('В сценарии маппируйте поля SellGram → AmoCRM: name, phone, email', 'Stsenariydagi SellGram → AmoCRM maydonlarini moslashtiring: name, phone, email')}</li>
          <li>{tr('Проверьте тестовым заказом', 'Test buyurtma bilan tekshiring')}</li>
        </ol>
      </article>

      {/* Payload reference */}
      <article className="sg-card">
        <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{tr('Структура событий', 'Voqealar tuzilishi')}</h4>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            {
              event: 'customer.created',
              fields: 'customerId, telegramId, firstName, lastName, username',
            },
            {
              event: 'order.created',
              fields: 'orderId, orderNumber, total, customerId',
            },
            {
              event: 'order.status_changed',
              fields: 'orderId, status',
            },
            {
              event: 'order.paid',
              fields: 'orderId, storeId',
            },
          ].map(({ event, fields }) => (
            <div key={event} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: '#1e3a5f', marginBottom: 2 }}>{event}</div>
              <div style={{ color: '#748278' }}>data: {`{ ${fields} }`}</div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
