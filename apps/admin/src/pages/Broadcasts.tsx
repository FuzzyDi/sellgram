import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type TargetType = 'ALL' | 'SELECTED';
type NoticeTone = 'success' | 'error' | 'info';

export default function Broadcasts() {
  const { tr, locale } = useAdminI18n();
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [targetType, setTargetType] = useState<TargetType>('ALL');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  async function loadStores() {
    const list = await adminApi.getStores();
    const normalized = Array.isArray(list) ? list : [];
    setStores(normalized);
    if (!storeId && normalized[0]?.id) setStoreId(normalized[0].id);
  }

  async function loadCustomers() {
    const result = await adminApi.getCustomers('page=1&pageSize=500');
    setCustomers(Array.isArray(result?.items) ? result.items : []);
  }

  async function loadCampaigns(targetStoreId?: string) {
    if (!targetStoreId) {
      setCampaigns([]);
      return;
    }
    const list = await adminApi.getBroadcasts(targetStoreId);
    setCampaigns(Array.isArray(list) ? list : []);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      await Promise.all([loadStores(), loadCustomers()]);
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0440\u0430\u0441\u0441\u044B\u043B\u043A\u0438', "Xabarnoma ma'lumotlarini yuklab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (storeId) {
      setSelectedCustomerIds([]);
      void loadCampaigns(storeId);
    }
  }, [storeId]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = customers.filter((c) => c?.telegramId);
    if (!q) return base;
    return base.filter((c) => {
      const label = [c.firstName, c.lastName, c.telegramUser, c.phone].filter(Boolean).join(' ').toLowerCase();
      return label.includes(q);
    });
  }, [customers, search]);

  const canSend =
    !!storeId &&
    message.trim().length > 0 &&
    (targetType === 'ALL' || selectedCustomerIds.length > 0);

  const statusLabel: Record<string, string> = {
    DRAFT: tr('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a', 'Qoralama'),
    SENT: tr('\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430', 'Yuborildi'),
    FAILED: tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xato'),
  };

  function campaignBadgeStyle(status: string): React.CSSProperties {
    if (status === 'SENT')   return { background: '#d1fae5', color: '#065f46' };
    if (status === 'FAILED') return { background: '#fee2e2', color: '#991b1b' };
    return { background: '#f3f4f6', color: '#4b5563' };
  }

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function sendCampaign() {
    if (!canSend) return;
    setSending(true);
    try {
      await adminApi.sendBroadcast({
        storeId,
        title: title.trim() || undefined,
        message: message.trim(),
        targetType,
        customerIds: targetType === 'SELECTED' ? selectedCustomerIds : undefined,
      });
      setTitle('');
      setMessage('');
      setSearch('');
      setSelectedCustomerIds([]);
      await loadCampaigns(storeId);
      showNotice('success', tr('Рассылка отправлена', 'Xabarnoma yuborildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik'));
    } finally {
      setSending(false);
    }
  }

  function toggleCustomer(customerId: string) {
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
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

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div>
          <div className="sg-skeleton" style={{ height: 28, width: '30%' }} />
          <div className="sg-skeleton" style={{ height: 14, width: '55%', marginTop: 8 }} />
        </div>
        <div className="sg-grid cols-2">
          <div className="sg-card sg-grid" style={{ gap: 10 }}>
            <div className="sg-skeleton" style={{ height: 22, width: '50%' }} />
            {[1, 2, 3, 4].map((i) => <div key={i} className="sg-skeleton" style={{ height: 40, borderRadius: 10 }} />)}
            <div className="sg-skeleton" style={{ height: 80, borderRadius: 10 }} />
            <div className="sg-skeleton" style={{ height: 38, borderRadius: 10, width: '40%' }} />
          </div>
          <div className="sg-card sg-grid" style={{ gap: 10 }}>
            <div className="sg-skeleton" style={{ height: 22, width: '55%' }} />
            {[1, 2].map((i) => <div key={i} className="sg-skeleton" style={{ height: 80, borderRadius: 12 }} />)}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}
      <header>
        <h2 className="sg-title">{tr('Рассылки', 'Xabarnomalar')}</h2>
        <p className="sg-subtitle">{tr('Маркетинговые сообщения по базе клиентов', 'Mijozlar bazasiga marketing xabarlari yuborish')}</p>
      </header>

      <div className="sg-grid cols-2">
        <article className="sg-card sg-grid" style={{ gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Новая рассылка', 'Yangi xabarnoma')}</h3>

          <label style={{ fontSize: 12, color: '#5f6d64' }}>{tr('Магазин', "Do'kon")}</label>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>

          <label style={{ fontSize: 12, color: '#5f6d64' }}>{tr('Заголовок (необязательно)', 'Sarlavha (ixtiyoriy)')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#5f6d64' }}>{tr('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435', 'Xabar')}</label>
            <span style={{ fontSize: 11, color: message.length > 3800 ? '#b91c1c' : '#9ca3af' }}>{message.length} / 4096</span>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={4096}
            className="w-full"
            style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', resize: 'vertical' }}
          />

          <div>
            <div className="sg-pill-row">
              <button type="button" onClick={() => setTargetType('ALL')} className={`sg-pill ${targetType === 'ALL' ? 'active' : ''}`}>
                {tr('Всем клиентам', 'Barcha mijozlarga')}
              </button>
              <button type="button" onClick={() => setTargetType('SELECTED')} className={`sg-pill ${targetType === 'SELECTED' ? 'active' : ''}`}>
                {tr('Выбранным', 'Tanlanganlarga')}
              </button>
            </div>
          </div>

          {targetType === 'SELECTED' && (
            <div style={{ border: '1px solid #d6e0da', borderRadius: 12, padding: 12 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr('Поиск клиента', 'Mijoz qidirish')}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}
              />
              <div style={{ maxHeight: 240, overflow: 'auto' }}>
                {filteredCustomers.map((customer) => (
                  <label key={customer.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.includes(customer.id)}
                      onChange={() => toggleCustomer(customer.id)}
                    />
                    <span>
                      {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.telegramUser || customer.id}
                      {customer.phone ? ` (${customer.phone})` : ''}
                    </span>
                  </label>
                ))}
                {filteredCustomers.length === 0 && <p className="sg-subtitle">{tr('Список клиентов пуст', "Mijozlar ro'yxati bo'sh")}</p>}
              </div>
            </div>
          )}

          <button className="sg-btn primary" type="button" onClick={sendCampaign} disabled={!canSend || sending}>
            {sending ? tr('Отправка...', 'Yuborilmoqda...') : tr('Отправить', 'Yuborish')}
          </button>
        </article>

        <article className="sg-card sg-grid" style={{ gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Последние рассылки', "So'nggi xabarnomalar")}</h3>

          {(campaigns || []).map((campaign) => (
            <div key={campaign.id} className="sg-card soft" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{campaign.title || tr('\u0411\u0435\u0437 \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0430', 'Sarlavhasiz')}</p>
                <span className="sg-badge" style={campaignBadgeStyle(campaign.status)}>{statusLabel[campaign.status] || campaign.status}</span>
              </div>
              <p style={{ margin: '8px 0 0', color: '#5f6d64', fontSize: 13, lineHeight: 1.5 }}>{campaign.message}</p>
              <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 12, color: '#748278', flexWrap: 'wrap' }}>
                <span>{new Date(campaign.createdAt).toLocaleString(locale)}</span>
                <span>{tr('\u041f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u0435\u0439', 'Qabul qiluvchilar')}: <strong>{campaign.totalRecipients}</strong></span>
                <span style={{ color: campaign.failedCount > 0 ? '#b91c1c' : undefined }}>
                  {tr('\u041e\u0448\u0438\u0431\u043a\u0438', 'Xatolar')}: {campaign.failedCount}
                </span>
              </div>
            </div>
          ))}

          {campaigns.length === 0 && <p className="sg-subtitle">{tr('Рассылок пока нет', "Hali xabarnomalar yo'q")}</p>}
        </article>
      </div>
    </section>
  );
}
