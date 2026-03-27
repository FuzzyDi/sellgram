import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type SegmentFilter = 'all' | 'buyers' | 'new' | 'inactive' | 'selected';
type NoticeTone = 'success' | 'error' | 'info';

export default function Broadcasts() {
  const { tr, locale } = useAdminI18n();
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [segment, setSegment] = useState<SegmentFilter>('all');
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  const selectedCustomerIds = useMemo(() => selectedCustomers.map((c) => c.id), [selectedCustomers]);

  async function loadStores() {
    const list = await adminApi.getStores();
    const normalized = Array.isArray(list) ? list : [];
    setStores(normalized);
    if (!storeId && normalized[0]?.id) setStoreId(normalized[0].id);
  }

  async function loadCampaigns(targetStoreId?: string) {
    if (!targetStoreId) { setCampaigns([]); return; }
    try {
      const list = await adminApi.getBroadcasts(targetStoreId);
      setCampaigns(Array.isArray(list) ? list : []);
    } catch { /* keep stale */ }
  }

  async function bootstrap() {
    setLoading(true);
    try { await loadStores(); }
    catch (err: any) { showNotice('error', err?.message || tr('Не удалось загрузить рассылки', "Xabarnoma ma'lumotlarini yuklab bo'lmadi")); }
    finally { setLoading(false); }
  }

  useEffect(() => { void bootstrap(); }, []);

  useEffect(() => {
    if (storeId) {
      setSelectedCustomers([]);
      void loadCampaigns(storeId);
    }
  }, [storeId]);

  // Poll every 5 s while any campaign is in-flight
  useEffect(() => {
    const hasInflight = campaigns.some((c) => c.status === 'QUEUED' || c.status === 'SENDING');
    if (!hasInflight || !storeId) return;
    const timer = setInterval(() => void loadCampaigns(storeId), 5000);
    return () => clearInterval(timer);
  }, [campaigns, storeId]);

  // Fetch audience count when store or segment changes (non-SELECTED modes)
  useEffect(() => {
    if (!storeId || segment === 'selected') { setAudienceCount(null); return; }
    setAudienceLoading(true);
    const apiSegment = segment === 'all' ? undefined : segment;
    adminApi.getBroadcastAudience(storeId, apiSegment)
      .then((res: any) => setAudienceCount(res?.count ?? res?.data?.count ?? null))
      .catch(() => setAudienceCount(null))
      .finally(() => setAudienceLoading(false));
  }, [storeId, segment]);

  // Debounced customer search for SELECTED mode
  useEffect(() => {
    if (segment !== 'selected') return;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const q = search.trim();
        const params = `page=1&pageSize=30${q ? '&search=' + encodeURIComponent(q) : ''}`;
        const result = await adminApi.getCustomers(params);
        setSearchResults(Array.isArray(result?.items) ? result.items.filter((c: any) => c?.telegramId) : []);
      } catch { /* keep stale */ }
      finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, segment]);

  const displayList = useMemo(() => {
    const resultIds = new Set(searchResults.map((c) => c.id));
    const selectedNotInResults = selectedCustomers.filter((c) => !resultIds.has(c.id));
    return [...selectedNotInResults, ...searchResults];
  }, [searchResults, selectedCustomers]);

  const canSend =
    !!storeId &&
    message.trim().length > 0 &&
    (segment !== 'selected' || selectedCustomerIds.length > 0);

  const segmentOptions: { value: SegmentFilter; label: string; labelUz: string }[] = [
    { value: 'all',      label: 'Всем клиентам',   labelUz: 'Barcha mijozlarga' },
    { value: 'buyers',   label: 'Покупатели',       labelUz: 'Xaridorlar' },
    { value: 'new',      label: 'Новые (7 дней)',   labelUz: 'Yangi (7 kun)' },
    { value: 'inactive', label: 'Без заказов',      labelUz: 'Buyurtmasizlar' },
    { value: 'selected', label: 'Выбранным',        labelUz: 'Tanlanganlarga' },
  ];

  const statusLabel: Record<string, string> = {
    DRAFT:   tr('Черновик',     'Qoralama'),
    QUEUED:  tr('В очереди',    'Navbatda'),
    SENDING: tr('Отправляется', 'Yuborilmoqda'),
    SENT:    tr('Отправлена',   'Yuborildi'),
    FAILED:  tr('Ошибка',       'Xato'),
  };

  function campaignBadgeStyle(status: string): React.CSSProperties {
    if (status === 'SENT')    return { background: '#d1fae5', color: '#065f46' };
    if (status === 'FAILED')  return { background: '#fee2e2', color: '#991b1b' };
    if (status === 'QUEUED')  return { background: '#dbeafe', color: '#1e40af' };
    if (status === 'SENDING') return { background: '#fef9c3', color: '#854d0e' };
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
      const apiSegment = segment !== 'all' && segment !== 'selected' ? segment : undefined;
      await adminApi.sendBroadcast({
        storeId,
        title: title.trim() || undefined,
        message: message.trim(),
        targetType: segment === 'selected' ? 'SELECTED' : 'ALL',
        segmentFilter: apiSegment,
        customerIds: segment === 'selected' ? selectedCustomerIds : undefined,
      });
      setTitle('');
      setMessage('');
      setSearch('');
      setSelectedCustomers([]);
      await loadCampaigns(storeId);
      showNotice('success', tr('Рассылка отправлена', 'Xabarnoma yuborildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSending(false);
    }
  }

  function toggleCustomer(customer: any) {
    setSelectedCustomers((prev) =>
      prev.some((c) => c.id === customer.id) ? prev.filter((c) => c.id !== customer.id) : [...prev, customer]
    );
  }

  const noticeNode = notice ? (
    <div
      style={{
        position: 'fixed', top: 18, right: 18, zIndex: 70,
        minWidth: 280, maxWidth: 440, borderRadius: 12, padding: '12px 14px',
        fontSize: 14, fontWeight: 700, boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
        color: notice.tone === 'error' ? '#991b1b' : notice.tone === 'success' ? '#065f46' : '#1e3a8a',
        background: notice.tone === 'error' ? '#fee2e2' : notice.tone === 'success' ? '#d1fae5' : '#dbeafe',
        border: `1px solid ${notice.tone === 'error' ? '#fecaca' : notice.tone === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
      }}
      role="status" aria-live="polite"
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
        {/* ── Left: compose ── */}
        <article className="sg-card sg-grid" style={{ gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Новая рассылка', 'Yangi xabarnoma')}</h3>

          <label style={{ fontSize: 12, color: '#5f6d64' }}>{tr('Магазин', "Do'kon")}</label>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>

          <label style={{ fontSize: 12, color: '#5f6d64' }}>{tr('Заголовок (необязательно)', 'Sarlavha (ixtiyoriy)')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full" style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#5f6d64' }}>{tr('Сообщение', 'Xabar')}</label>
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

          {/* Segment selector */}
          <label style={{ fontSize: 12, color: '#5f6d64' }}>{tr('Аудитория', 'Auditoriya')}</label>
          <div className="sg-pill-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {segmentOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setSegment(opt.value); setSearch(''); setSelectedCustomers([]); }}
                className={`sg-pill${segment === opt.value ? ' active' : ''}`}
              >
                {tr(opt.label, opt.labelUz)}
              </button>
            ))}
          </div>

          {/* Audience count preview */}
          {segment !== 'selected' && (
            <div style={{ fontSize: 13, color: '#5f6d64', display: 'flex', alignItems: 'center', gap: 6 }}>
              {audienceLoading ? (
                <span>{tr('Считаем...', 'Hisoblanmoqda...')}</span>
              ) : audienceCount !== null ? (
                <span>
                  {tr('Получателей:', 'Qabul qiluvchilar:')} <strong>{audienceCount}</strong>
                </span>
              ) : null}
            </div>
          )}

          {/* SELECTED mode: customer search */}
          {segment === 'selected' && (
            <div style={{ border: '1px solid #d6e0da', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tr('Поиск клиента', 'Mijoz qidirish')}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 10px' }}
                />
                {selectedCustomerIds.length > 0 && (
                  <span style={{ marginLeft: 8, whiteSpace: 'nowrap', fontSize: 12, color: '#065f46', fontWeight: 700 }}>
                    {selectedCustomerIds.length} {tr('выбрано', 'tanlandi')}
                  </span>
                )}
              </div>
              <div style={{ maxHeight: 240, overflow: 'auto' }}>
                {searchLoading && <p className="sg-subtitle">{tr('Поиск...', 'Qidirilmoqda...')}</p>}
                {!searchLoading && displayList.map((customer) => (
                  <label key={customer.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.includes(customer.id)}
                      onChange={() => toggleCustomer(customer)}
                    />
                    <span>
                      {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.telegramUser || customer.id}
                      {customer.phone ? ` (${customer.phone})` : ''}
                    </span>
                  </label>
                ))}
                {!searchLoading && displayList.length === 0 && <p className="sg-subtitle">{tr('Клиенты не найдены', "Mijozlar topilmadi")}</p>}
              </div>
            </div>
          )}

          <button className="sg-btn primary" type="button" onClick={sendCampaign} disabled={!canSend || sending}>
            {sending ? tr('Отправка...', 'Yuborilmoqda...') : tr('Отправить', 'Yuborish')}
          </button>
          <p style={{ margin: 0, fontSize: 12, color: '#748278', lineHeight: 1.5 }}>
            {tr(
              'Сообщения доставляются только клиентам, не заблокировавшим бота. Счётчик аудитории учитывает только активных получателей.',
              "Xabarlar faqat botni bloklamagan mijozlarga yetkaziladi. Auditoriya hisoblagichi faqat faol qabul qiluvchilarni ko'rsatadi."
            )}
          </p>
        </article>

        {/* ── Right: history ── */}
        <article className="sg-card sg-grid" style={{ gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Последние рассылки', "So'nggi xabarnomalar")}</h3>

          {(campaigns || []).map((campaign) => (
            <div key={campaign.id} className="sg-card soft" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{campaign.title || tr('Без заголовка', 'Sarlavhasiz')}</p>
                <span className="sg-badge" style={campaignBadgeStyle(campaign.status)}>{statusLabel[campaign.status] || campaign.status}</span>
              </div>
              <p style={{ margin: '6px 0 0', color: '#5f6d64', fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word' }}>
                {campaign.message.length > 120 ? campaign.message.slice(0, 120) + '…' : campaign.message}
              </p>
              <div style={{ marginTop: 8, display: 'flex', gap: 10, fontSize: 12, color: '#748278', flexWrap: 'wrap' }}>
                <span>{new Date(campaign.createdAt).toLocaleString(locale)}</span>
                <span>{tr('Получателей', 'Qabul qiluvchilar')}: <strong>{campaign.totalRecipients}</strong></span>
                {campaign.status === 'SENT' || campaign.status === 'SENDING' ? (
                  <span style={{ color: '#065f46' }}>{tr('Доставлено', 'Yetkazildi')}: <strong>{campaign.sentCount ?? 0}</strong></span>
                ) : null}
                {campaign.failedCount > 0 && (
                  <span style={{ color: '#b91c1c' }}>{tr('Ошибок', 'Xatolar')}: {campaign.failedCount}</span>
                )}
              </div>
            </div>
          ))}

          {campaigns.length === 0 && <p className="sg-subtitle">{tr('Рассылок пока нет', "Hali xabarnomalar yo'q")}</p>}
        </article>
      </div>
    </section>
  );
}
