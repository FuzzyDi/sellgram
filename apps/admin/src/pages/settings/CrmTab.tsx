import React, { useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
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
    <section className="flex flex-col gap-3">
      <Card>
        <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('CRM интеграция', 'CRM integratsiya')}</h3>
        <p className="text-token-sm text-neutral-500">
          {tr(
            'Подключите Bitrix24 или AmoCRM — новые клиенты и заказы будут автоматически попадать в CRM.',
            'Bitrix24 yoki AmoCRM ulang — yangi mijozlar va buyurtmalar avtomatik CRM-ga tushadi.'
          )}
        </p>

        {/* Quick connect */}
        <div className="mt-3 flex flex-col gap-2.5">
          <Input
            label={tr('URL входящего вебхука CRM', 'CRM kiruvchi webhook URL')}
            value={crmUrl}
            onChange={(e) => setCrmUrl(e.target.value)}
            placeholder="https://your-crm.bitrix24.ru/rest/..."
          />
          <Button
            variant="primary"
            size="md"
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
          </Button>
        </div>
      </Card>

      {/* Bitrix24 instructions */}
      <Card>
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-token-2xl">⚡</span>
          <div>
            <div className="font-semibold text-token-lg text-neutral-800">Bitrix24</div>
            <div className="text-token-xs text-neutral-500">{tr('Входящий вебхук REST API', 'Kiruvchi webhook REST API')}</div>
          </div>
        </div>
        <ol className="m-0 pl-5 flex flex-col gap-2 text-token-sm text-neutral-600 leading-relaxed list-decimal">
          <li>{tr('Перейдите в Bitrix24 → Приложения → Вебхуки → Входящий вебхук', 'Bitrix24 → Ilovalar → Webhooklar → Kiruvchi webhook')}</li>
          <li>{tr('Скопируйте URL вида', 'Quyidagi URL-ni nusxalang:')} <code className="bg-neutral-100 rounded-token-sm px-1.5 py-0.5 text-token-xs">https://ДОМЕН.bitrix24.ru/rest/ПОЛЬЗОВАТЕЛЬ/ТОКЕН/</code></li>
          <li>{tr('Вставьте в поле URL выше и нажмите «Подключить»', 'Yuqoridagi URL maydoniga joylashtiring va "Ulash" tugmasini bosing')}</li>
          <li>{tr('SellGram будет отправлять события order.* и customer.created на этот URL', 'SellGram order.* va customer.created voqealarini ushbu URL ga yuboradi')}</li>
        </ol>
        <div className="mt-3 bg-warning/10 border border-warning/30 rounded-token-md px-3 py-2 text-token-xs text-neutral-700">
          {tr(
            "Bitrix24 REST не принимает вебхуки напрямую — настройте обработчик (например через n8n, Make или собственный сервер).",
            "Bitrix24 REST webhooklarni to'g'ridan-to'g'ri qabul qilmaydi — n8n, Make yoki o'z serveringiz orqali sozlang."
          )}
        </div>
      </Card>

      {/* AmoCRM instructions */}
      <Card>
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-token-2xl">🔗</span>
          <div>
            <div className="font-semibold text-token-lg text-neutral-800">AmoCRM</div>
            <div className="text-token-xs text-neutral-500">{tr('Через n8n / Make / Zapier', 'n8n / Make / Zapier orqali')}</div>
          </div>
        </div>
        <ol className="m-0 pl-5 flex flex-col gap-2 text-token-sm text-neutral-600 leading-relaxed list-decimal">
          <li>{tr('Создайте сценарий в n8n/Make с триггером Webhook', "n8n/Make'da Webhook trigger bilan stsenariy yarating")}</li>
          <li>{tr('Скопируйте URL триггера и вставьте в поле выше', 'Trigger URL-ni nusxalab yuqoridagi maydonga joylashtiring')}</li>
          <li>{tr('В сценарии маппируйте поля SellGram → AmoCRM: name, phone, email', 'Stsenariydagi SellGram → AmoCRM maydonlarini moslashtiring: name, phone, email')}</li>
          <li>{tr('Проверьте тестовым заказом', 'Test buyurtma bilan tekshiring')}</li>
        </ol>
      </Card>

      {/* Payload reference */}
      <Card>
        <h4 className="m-0 mb-2.5 text-token-base font-semibold text-neutral-800">{tr('Структура событий', 'Voqealar tuzilishi')}</h4>
        <div className="flex flex-col gap-2.5">
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
            <div key={event} className="bg-neutral-50 border border-neutral-200 rounded-token-md px-3 py-2 font-mono text-token-xs">
              <div className="font-semibold text-accent-600 mb-0.5">{event}</div>
              <div className="text-neutral-500">data: {`{ ${fields} }`}</div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
