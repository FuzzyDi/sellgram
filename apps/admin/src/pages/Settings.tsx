import React, { useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import type { NoticeTone } from './settings/types';
import StoresTab from './settings/StoresTab';
import DeliveryTab from './settings/DeliveryTab';
import LoyaltyTab from './settings/LoyaltyTab';
import AccountTab from './settings/AccountTab';
import ApiTab from './settings/ApiTab';
import WebhooksTab from './settings/WebhooksTab';
import CrmTab from './settings/CrmTab';

type TabKey = 'stores' | 'zones' | 'loyalty' | 'account' | 'api' | 'webhooks' | 'crm';

// Thin tab router (docs/ADMIN_REDESIGN.md §7 Phase 3, step 3a). Each tab
// is a fully self-contained component that fetches its own data lazily,
// on first activation — see settings/*.tsx. Visited tabs are kept
// mounted (hidden via display:none rather than unmounted) so a tab's
// already-fetched data survives switching away and back, matching the
// "useState for caching + useEffect on tab change" pattern requested —
// the cache is simply each tab's own component state staying alive.
export default function Settings() {
  const { tr, locale } = useAdminI18n();
  const [tab, setTab] = useState<TabKey>('stores');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(new Set(['stores']));
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  const [telegramLinkData, setTelegramLinkData] = useState<any | null>(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);

  // Shared with WebhooksTab/CrmTab only — the one genuine cross-tab
  // coupling in the original file (CRM's "quick connect" creates a
  // webhook, then switches to the Webhooks tab to show its secret).
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [webhooksRefreshKey, setWebhooksRefreshKey] = useState(0);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  function selectTab(next: TabKey) {
    setTab(next);
    setVisitedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }

  function handleWebhookCreatedFromCrm(secret: string) {
    setNewWebhookSecret(secret);
    setWebhooksRefreshKey((k) => k + 1);
    selectTab('webhooks');
  }

  async function generateTelegramLinkCode() {
    setTelegramLinkLoading(true);
    try {
      const data = await adminApi.createTelegramLinkCode();
      setTelegramLinkData(data);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setTelegramLinkLoading(false);
    }
  }

  const noticeNode = notice ? (
    <div
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 70,
        minWidth: 280,
        maxWidth: 440,
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 14,
        fontWeight: 700,
        boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
        color: notice.tone === 'error' ? '#991b1b' : notice.tone === 'success' ? '#065f46' : '#1e3a8a',
        background: notice.tone === 'error' ? '#fee2e2' : notice.tone === 'success' ? '#d1fae5' : '#dbeafe',
        border: `1px solid ${notice.tone === 'error' ? '#fecaca' : notice.tone === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
      }}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <header>
        <h2 className="sg-title">{tr('Настройки', 'Sozlamalar')}</h2>
        <p className="sg-subtitle">{tr('Магазины, доставка, лояльность и Telegram-привязка', "Do'konlar, yetkazib berish, loyallik va Telegram bog'lash")}</p>
      </header>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800 }}>{tr('Привязка Telegram-админа', "Telegram adminini bog'lash")}</p>
            <p className="sg-subtitle" style={{ marginTop: 4 }}>
              {tr('Сгенерируйте код и отправьте боту: /admin CODE', "Kod yarating va botga yuboring: /admin CODE")}
            </p>
          </div>
          <Button variant="primary" size="md" type="button" onClick={generateTelegramLinkCode}>
            {telegramLinkLoading ? tr('Генерируется...', 'Yaratilmoqda...') : tr('Сгенерировать код', 'Kod yaratish')}
          </Button>
        </div>

        {telegramLinkData && (
          <Card className="mt-3">
            <p style={{ margin: 0, fontSize: 14 }}>
              {tr('Код', 'Kod')}: <b style={{ fontFamily: 'monospace' }}>{telegramLinkData.code}</b>
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('Срок действия', 'Amal qilish muddati')}: {new Date(telegramLinkData.expiresAt).toLocaleString(locale)}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('Команда', 'Buyruq')}: <span style={{ fontFamily: 'monospace' }}>{telegramLinkData.command}</span>
            </p>
          </Card>
        )}
      </Card>

      <div className="flex gap-1">
        <Button variant={tab === 'stores' ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => selectTab('stores')}>
          {tr('Магазины', "Do'konlar")}
        </Button>
        <Button variant={tab === 'zones' ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => selectTab('zones')}>
          {tr('Доставка', 'Yetkazib berish')}
        </Button>
        <Button variant={tab === 'loyalty' ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => selectTab('loyalty')}>
          {tr('Лояльность', 'Loyallik')}
        </Button>
        <Button variant={tab === 'account' ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => selectTab('account')}>
          {tr('Аккаунт', 'Akkaunt')}
        </Button>
        <Button variant={tab === 'api' ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => selectTab('api')}>
          {tr('API', 'API')}
        </Button>
        <Button variant={tab === 'webhooks' ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => selectTab('webhooks')}>
          {tr('Webhooks', 'Webhooks')}
        </Button>
        <Button variant={tab === 'crm' ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => selectTab('crm')}>
          {tr('CRM', 'CRM')}
        </Button>
      </div>

      {visitedTabs.has('stores') && (
        <div style={{ display: tab === 'stores' ? 'block' : 'none' }}>
          <StoresTab onNotice={showNotice} />
        </div>
      )}
      {visitedTabs.has('zones') && (
        <div style={{ display: tab === 'zones' ? 'block' : 'none' }}>
          <DeliveryTab onNotice={showNotice} />
        </div>
      )}
      {visitedTabs.has('loyalty') && (
        <div style={{ display: tab === 'loyalty' ? 'block' : 'none' }}>
          <LoyaltyTab onNotice={showNotice} />
        </div>
      )}
      {visitedTabs.has('account') && (
        <div style={{ display: tab === 'account' ? 'block' : 'none' }}>
          <AccountTab onNotice={showNotice} />
        </div>
      )}
      {visitedTabs.has('api') && (
        <div style={{ display: tab === 'api' ? 'block' : 'none' }}>
          <ApiTab onNotice={showNotice} />
        </div>
      )}
      {visitedTabs.has('webhooks') && (
        <div style={{ display: tab === 'webhooks' ? 'block' : 'none' }}>
          <WebhooksTab
            onNotice={showNotice}
            newWebhookSecret={newWebhookSecret}
            onCloseSecret={() => setNewWebhookSecret(null)}
            refreshKey={webhooksRefreshKey}
          />
        </div>
      )}
      {visitedTabs.has('crm') && (
        <div style={{ display: tab === 'crm' ? 'block' : 'none' }}>
          <CrmTab onNotice={showNotice} onWebhookCreated={handleWebhookCreatedFromCrm} />
        </div>
      )}
    </section>
  );
}
