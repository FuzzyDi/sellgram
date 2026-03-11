import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';

export default function Broadcasts() {
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
    const result = await adminApi.getCustomers('page=1&pageSize=200');
    const items = Array.isArray(result?.items) ? result.items : [];
    setCustomers(items);
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

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => customer?.telegramId),
    [customers]
  );

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
      alert('Campaign sent');
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

  if (loading) return <p className="text-gray-400">Loading broadcasts...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Broadcasts</h2>
      <p className="text-sm text-gray-500 mb-5">Send promotional messages to all or selected customers.</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold mb-3">New Campaign</h3>
          <label className="text-xs text-gray-500">Store</label>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mb-3">
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>

          <label className="text-xs text-gray-500">Title (optional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />

          <label className="text-xs text-gray-500">Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
            className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />

          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">Target Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                onClick={() => setTargetType('ALL')}
                className={`px-3 py-1.5 rounded-lg text-sm ${targetType === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
              >
                All Customers
              </Button>
              <Button
                onClick={() => setTargetType('SELECTED')}
                className={`px-3 py-1.5 rounded-lg text-sm ${targetType === 'SELECTED' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
              >
                Selected
              </Button>
            </div>
          </div>

          {targetType === 'SELECTED' && (
            <div className="border rounded-lg p-3 max-h-56 overflow-auto mb-3">
              {filteredCustomers.map((customer) => (
                <label key={customer.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="text-sm py-1">
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.includes(customer.id)}
                    onChange={() => toggleCustomer(customer.id)}
                  />
                  <span>
                    {customer.firstName || customer.telegramUser || customer.id} {customer.phone ? `(${customer.phone})` : ''}
                  </span>
                </label>
              ))}
              {filteredCustomers.length === 0 && <p className="text-sm text-gray-400">No customers yet.</p>}
            </div>
          )}

          <button
            onClick={sendCampaign}
            disabled={!canSend || sending}
            className="w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send Campaign'}
          </button>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold mb-3">Recent Campaigns</h3>
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="border rounded-lg p-3">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <p className="font-medium">{campaign.title || 'Untitled campaign'}</p>
                  <span className="text-xs px-2 py-1 rounded bg-gray-100">{campaign.status}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{campaign.message}</p>
                <p className="text-xs text-gray-400 mt-2">
                  Recipients: {campaign.totalRecipients} | Sent: {campaign.sentCount} | Failed: {campaign.failedCount}
                </p>
              </div>
            ))}
            {campaigns.length === 0 && <p className="text-sm text-gray-400">No campaigns sent yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
