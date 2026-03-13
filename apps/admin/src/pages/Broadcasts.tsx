import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

export default function Broadcasts() {
  const { tr } = useAdminI18n();
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [targetType, setTargetType] = useState<'ALL' | 'SELECTED'>('ALL');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function loadStores() {
    const list = await adminApi.getStores();
    const normalized = Array.isArray(list) ? list : [];
    setStores(normalized);
    if (!storeId && normalized[0]?.id) setStoreId(normalized[0].id);
  }

  async function loadCustomers() {
    const result = await adminApi.getCustomers('page=1&pageSize=300');
    setCustomers(Array.isArray(result?.items) ? result.items : []);
  }

  async function loadCampaigns(targetStoreId?: string) {
    const list = await adminApi.getBroadcasts(targetStoreId);
    setCampaigns(Array.isArray(list) ? list : []);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      await Promise.all([loadStores(), loadCustomers()]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (storeId) loadCampaigns(storeId);
  }, [storeId]);

  const filteredCustomers = useMemo(() => customers.filter((c) => c?.telegramId), [customers]);

  const canSend =
    !!storeId &&
    message.trim().length > 0 &&
    (targetType === 'ALL' || selectedCustomerIds.length > 0);

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
      setSelectedCustomerIds([]);
      await loadCampaigns(storeId);
      alert(tr('Рассылка отправлена', 'Xabarnoma yuborildi'));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  function toggleCustomer(customerId: string) {
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  }

  if (loading) {
    return <p className="sg-subtitle">{tr('Загрузка рассылок...', 'Xabarnomalar yuklanmoqda...')}</p>;
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
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

          <label style={{ fontSize: 12, color: '#5f6d64' }}>{tr('Сообщение', 'Xabar')}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
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
            <div style={{ border: '1px solid #d6e0da', borderRadius: 12, padding: 12, maxHeight: 240, overflow: 'auto' }}>
              {filteredCustomers.map((customer) => (
                <label key={customer.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.includes(customer.id)}
                    onChange={() => toggleCustomer(customer.id)}
                  />
                  <span>
                    {customer.firstName || customer.telegramUser || customer.id}
                    {customer.phone ? ` (${customer.phone})` : ''}
                  </span>
                </label>
              ))}
              {filteredCustomers.length === 0 && <p className="sg-subtitle">{tr('Список клиентов пуст', "Mijozlar ro'yxati bo'sh")}</p>}
            </div>
          )}

          <button className="sg-btn primary" type="button" onClick={sendCampaign} disabled={!canSend || sending}>
            {sending ? tr('Отправка...', 'Yuborilmoqda...') : tr('Отправить', 'Yuborish')}
          </button>
        </article>

        <article className="sg-card sg-grid" style={{ gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Последние рассылки', "So'nggi xabarnomalar")}</h3>

          {(campaigns || []).map((campaign) => (
            <div key={campaign.id} style={{ border: '1px solid #e0e8e2', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{campaign.title || tr('Без заголовка', 'Sarlavhasiz')}</p>
                <span className="sg-badge" style={{ background: '#eef3f0', color: '#476154' }}>{campaign.status}</span>
              </div>
              <p style={{ margin: '8px 0 0', color: '#5f6d64', fontSize: 13 }}>{campaign.message}</p>
              <p style={{ margin: '10px 0 0', color: '#748278', fontSize: 12 }}>
                {tr('Получатели', 'Qabul qiluvchilar')}: {campaign.totalRecipients} | {tr('Отправлено', 'Yuborildi')}:{' '}
                {campaign.sentCount} | {tr('Ошибки', 'Xatolar')}: {campaign.failedCount}
              </p>
            </div>
          ))}

          {campaigns.length === 0 && <p className="sg-subtitle">{tr('Рассылок пока нет', 'Hali xabarnomalar yo‘q')}</p>}
        </article>
      </div>
    </section>
  );
}
