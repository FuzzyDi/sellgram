import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Select from '../components/Select';
import Badge, { type BadgeVariant } from '../components/Badge';

type SegmentFilter = 'all' | 'buyers' | 'new' | 'inactive' | 'selected';
type NoticeTone = 'success' | 'error' | 'info';

const CAMPAIGN_STATUS_BADGE: Record<string, BadgeVariant> = {
  SENT: 'success',
  FAILED: 'danger',
  QUEUED: 'info',
  SENDING: 'warning',
};

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
      showNotice('success', tr('Рассылка поставлена в очередь', "Xabarnoma navbatga qo'yildi"));
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
      className={[
        'fixed top-[18px] right-[18px] z-[70] min-w-[280px] max-w-[440px] rounded-token-lg px-3.5 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30'
          : notice.tone === 'success' ? 'bg-success/10 text-success border-success/30'
          : 'bg-accent-600/10 text-accent-600 border-accent-600/30',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <div className="h-7 w-[30%] rounded-token-sm bg-neutral-100 animate-pulse" />
          <div className="h-3.5 w-1/2 rounded-token-sm bg-neutral-100 animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="flex flex-col gap-2.5">
            <div className="h-5 w-1/2 rounded-token-sm bg-neutral-100 animate-pulse" />
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-token-md bg-neutral-100 animate-pulse" />)}
            <div className="h-20 rounded-token-md bg-neutral-100 animate-pulse" />
            <div className="h-[38px] w-2/5 rounded-token-md bg-neutral-100 animate-pulse" />
          </Card>
          <Card className="flex flex-col gap-2.5">
            <div className="h-5 w-1/2 rounded-token-sm bg-neutral-100 animate-pulse" />
            {[1, 2].map((i) => <div key={i} className="h-20 rounded-token-lg bg-neutral-100 animate-pulse" />)}
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <header>
        <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Рассылки', 'Xabarnomalar')}</h2>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Маркетинговые сообщения по базе клиентов', "Mijozlar bazasiga marketing xabarlari yuborish")}</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Left: compose */}
        <Card className="flex flex-col gap-2.5">
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Новая рассылка', 'Yangi xabarnoma')}</h3>

          <Select label={tr('Магазин', "Do'kon")} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </Select>

          <Input label={tr('Заголовок (необязательно)', 'Sarlavha (ixtiyoriy)')} value={title} onChange={(e) => setTitle(e.target.value)} />

          <div className="flex justify-between items-center">
            <label className="text-token-sm font-medium text-neutral-700">{tr('Сообщение', 'Xabar')}</label>
            <span className={`text-token-xs ${message.length > 3800 ? 'text-danger' : 'text-neutral-400'}`}>{message.length} / 4096</span>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={4096}
            className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 resize-y"
          />

          {/* Segment selector */}
          <label className="text-token-sm font-medium text-neutral-700">{tr('Аудитория', 'Auditoriya')}</label>
          <div className="flex flex-wrap gap-1.5">
            {segmentOptions.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={segment === opt.value ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => { setSegment(opt.value); setSearch(''); setSelectedCustomers([]); }}
              >
                {tr(opt.label, opt.labelUz)}
              </Button>
            ))}
          </div>

          {/* Audience count preview */}
          {segment !== 'selected' && (
            <div className="text-token-sm text-neutral-600 flex items-center gap-1.5">
              {audienceLoading ? (
                <span>{tr('Считаем...', 'Hisoblanmoqda...')}</span>
              ) : audienceCount !== null ? (
                <span>{tr('Получателей:', 'Qabul qiluvchilar:')} <strong>{audienceCount}</strong></span>
              ) : null}
            </div>
          )}

          {/* SELECTED mode: customer search */}
          {segment === 'selected' && (
            <div className="border border-neutral-200 rounded-token-lg p-3">
              <div className="flex justify-between items-center gap-2 mb-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tr('Поиск клиента', 'Mijoz qidirish')}
                />
                {selectedCustomerIds.length > 0 && (
                  <span className="whitespace-nowrap text-token-xs font-semibold text-success">
                    {selectedCustomerIds.length} {tr('выбрано', 'tanlandi')}
                  </span>
                )}
              </div>
              <div className="max-h-[240px] overflow-auto">
                {searchLoading && <p className="text-token-sm text-neutral-500">{tr('Поиск...', 'Qidirilmoqda...')}</p>}
                {!searchLoading && displayList.map((customer) => (
                  <label key={customer.id} className="flex gap-2 items-center text-token-sm mb-1.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent-600"
                      checked={selectedCustomerIds.includes(customer.id)}
                      onChange={() => toggleCustomer(customer)}
                    />
                    <span>
                      {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.telegramUser || customer.id}
                      {customer.phone ? ` (${customer.phone})` : ''}
                    </span>
                  </label>
                ))}
                {!searchLoading && displayList.length === 0 && <p className="text-token-sm text-neutral-500">{tr('Клиенты не найдены', "Mijozlar topilmadi")}</p>}
              </div>
            </div>
          )}

          <Button variant="primary" size="md" type="button" onClick={sendCampaign} disabled={!canSend || sending}>
            {sending ? tr('Отправка...', 'Yuborilmoqda...') : tr('Отправить', 'Yuborish')}
          </Button>
          <p className="m-0 text-token-xs text-neutral-500 leading-relaxed">
            {tr(
              'Сообщения доставляются только клиентам, не заблокировавшим бота. Счётчик аудитории учитывает только активных получателей.',
              "Xabarlar faqat botni bloklamagan mijozlarga yetkaziladi. Auditoriya hisoblagichi faqat faol qabul qiluvchilarni ko'rsatadi."
            )}
          </p>
        </Card>

        {/* Right: history */}
        <Card className="flex flex-col gap-2.5">
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Последние рассылки', "So'nggi xabarnomalar")}</h3>

          {(campaigns || []).map((campaign) => (
            <Card key={campaign.id} className="bg-neutral-50">
              <div className="flex justify-between gap-2 items-center">
                <p className="m-0 font-semibold text-token-sm text-neutral-800">{campaign.title || tr('Без заголовка', 'Sarlavhasiz')}</p>
                <Badge variant={CAMPAIGN_STATUS_BADGE[campaign.status] || 'neutral'}>{statusLabel[campaign.status] || campaign.status}</Badge>
              </div>
              <p className="mt-1.5 mb-0 text-neutral-600 text-token-sm leading-relaxed break-words">
                {campaign.message.length > 120 ? campaign.message.slice(0, 120) + '…' : campaign.message}
              </p>
              <div className="mt-2 flex gap-2.5 text-token-xs text-neutral-500 flex-wrap">
                <span>{new Date(campaign.createdAt).toLocaleString(locale)}</span>
                <span>{tr('Получателей', 'Qabul qiluvchilar')}: <strong>{campaign.totalRecipients}</strong></span>
                {campaign.status === 'SENT' || campaign.status === 'SENDING' ? (
                  <span className="text-success">{tr('Доставлено', 'Yetkazildi')}: <strong>{campaign.sentCount ?? 0}</strong></span>
                ) : null}
                {campaign.failedCount > 0 && (
                  <span className="text-danger">{tr('Ошибок', 'Xatolar')}: {campaign.failedCount}</span>
                )}
              </div>
            </Card>
          ))}

          {campaigns.length === 0 && <p className="text-token-sm text-neutral-500">{tr('Рассылок пока нет', "Hali xabarnomalar yo'q")}</p>}
        </Card>
      </div>
    </section>
  );
}
