import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';

export default function Settings() {
  const [tab, setTab] = useState<'stores' | 'zones' | 'loyalty'>('stores');
  const [stores, setStores] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [telegramLinkData, setTelegramLinkData] = useState<any | null>(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);

  const [showStoreForm, setShowStoreForm] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [storeForm, setStoreForm] = useState({ name: '', botToken: '', welcomeMessage: '' });

  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: '', price: '', freeFrom: '', storeId: '' });

  async function load() {
    setLoading(true);
    try {
      const [s, z, l] = await Promise.all([
        adminApi.getStores(),
        adminApi.getDeliveryZones(),
        adminApi.getLoyaltyConfig(),
      ]);
      setStores(Array.isArray(s) ? s : []);
      setZones(Array.isArray(z) ? z : []);
      setLoyalty(l);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generateTelegramLinkCode() {
    setTelegramLinkLoading(true);
    try {
      const data = await adminApi.createTelegramLinkCode();
      setTelegramLinkData(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTelegramLinkLoading(false);
    }
  }

  function openCreateStore() {
    setEditingStoreId(null);
    setStoreForm({ name: '', botToken: '', welcomeMessage: '' });
    setShowStoreForm(true);
  }

  function openEditStore(store: any) {
    setEditingStoreId(store.id);
    setStoreForm({ name: store.name || '', botToken: '', welcomeMessage: store.welcomeMessage || '' });
    setShowStoreForm(true);
  }

  async function saveStore() {
    try {
      if (editingStoreId) {
        const data: any = { name: storeForm.name, welcomeMessage: storeForm.welcomeMessage };
        if (storeForm.botToken) data.botToken = storeForm.botToken;
        await adminApi.updateStore(editingStoreId, data);
      } else {
        if (!storeForm.name || !storeForm.botToken) {
          alert('Store name and bot token are required');
          return;
        }
        await adminApi.createStore(storeForm);
      }
      setShowStoreForm(false);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  function openCreateZone() {
    setEditingZoneId(null);
    setZoneForm({ name: '', price: '', freeFrom: '', storeId: stores[0]?.id || '' });
    setShowZoneForm(true);
  }

  function openEditZone(zone: any) {
    setEditingZoneId(zone.id);
    setZoneForm({
      name: zone.name || '',
      price: String(zone.price || ''),
      freeFrom: zone.freeFrom ? String(zone.freeFrom) : '',
      storeId: zone.storeId || '',
    });
    setShowZoneForm(true);
  }

  async function saveZone() {
    try {
      const data: any = {
        name: zoneForm.name,
        price: Number(zoneForm.price),
        freeFrom: zoneForm.freeFrom ? Number(zoneForm.freeFrom) : null,
      };
      if (editingZoneId) {
        await adminApi.updateDeliveryZone(editingZoneId, data);
      } else {
        await adminApi.createDeliveryZone({ ...data, storeId: zoneForm.storeId || stores[0]?.id });
      }
      setShowZoneForm(false);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function deleteZone(id: string) {
    if (!confirm('Delete this zone?')) return;
    try {
      await adminApi.deleteDeliveryZone(id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function saveLoyalty() {
    try {
      await adminApi.updateLoyaltyConfig(loyalty);
      alert('Saved');
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) return <p className="text-gray-400">Loading settings...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      <div className="bg-white rounded-xl border p-4 mb-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p className="font-semibold">Telegram Admin Linking</p>
            <p className="text-sm text-gray-500">Generate a one-time code and send `/admin CODE` to your bot.</p>
          </div>
          <Button onClick={generateTelegramLinkCode} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">
            {telegramLinkLoading ? 'Generating...' : 'Generate Code'}
          </Button>
        </div>
        {telegramLinkData && (
          <div className="mt-3 p-3 rounded-lg bg-slate-50 border">
            <p className="text-sm">Code: <span className="font-mono font-bold">{telegramLinkData.code}</span></p>
            <p className="text-xs text-gray-500 mt-1">Expires: {new Date(telegramLinkData.expiresAt).toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">Command: <span className="font-mono">{telegramLinkData.command}</span></p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f3f4f6', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'stores', label: 'Stores' },
          { key: 'zones', label: 'Delivery' },
          { key: 'loyalty', label: 'Loyalty' },
        ].map((t: any) => (
          <Button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm ${tab === t.key ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500'}`}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'stores' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <p className="text-sm text-gray-500">Each store represents one Telegram bot.</p>
            <Button onClick={openCreateStore} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">+ Store</Button>
          </div>

          {stores.map((store) => (
            <div key={store.id} className="bg-white rounded-xl border p-4 mb-3">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="font-bold">{store.name}</p>
                  {store.botUsername && <p className="text-sm text-blue-500">@{store.botUsername}</p>}
                </div>
                <Button onClick={() => openEditStore(store)} className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">Edit</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'zones' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <p className="text-sm text-gray-500">Delivery zones and tariffs.</p>
            <Button onClick={openCreateZone} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">+ Zone</Button>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-3">Zone</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Free From</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{zone.name}</td>
                    <td className="px-4 py-3">{Number(zone.price).toLocaleString()} UZS</td>
                    <td className="px-4 py-3 text-gray-500">{zone.freeFrom ? Number(zone.freeFrom).toLocaleString() + ' UZS' : '-'}</td>
                    <td className="px-4 py-3">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button onClick={() => openEditZone(zone)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded">Edit</Button>
                        <Button onClick={() => deleteZone(zone.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded">Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'loyalty' && loyalty && (
        <div className="bg-white rounded-xl border p-6 max-w-lg">
          <h3 className="font-bold mb-4">Loyalty Program</h3>
          <form onSubmit={(e) => { e.preventDefault(); saveLoyalty(); }}>
            <div className="space-y-4">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="text-sm">
                <input type="checkbox" checked={!!loyalty.isEnabled} onChange={(e) => setLoyalty({ ...loyalty, isEnabled: e.target.checked })} /> Enabled
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unit Amount</label>
                  <input type="number" value={loyalty.unitAmount || 1000} onChange={(e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Points Per Unit</label>
                  <input type="number" value={loyalty.pointsPerUnit || 1} onChange={(e) => setLoyalty({ ...loyalty, pointsPerUnit: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Point Value</label>
                  <input type="number" value={loyalty.pointValue || 100} onChange={(e) => setLoyalty({ ...loyalty, pointValue: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Max Discount %</label>
                  <input type="number" value={loyalty.maxDiscountPct || 30} onChange={(e) => setLoyalty({ ...loyalty, maxDiscountPct: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg">Save</button>
            </div>
          </form>
        </div>
      )}

      {showStoreForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="font-bold mb-4">{editingStoreId ? 'Edit Store' : 'New Store'}</h3>
            <input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2" placeholder="Store name" />
            <input value={storeForm.botToken} onChange={(e) => setStoreForm({ ...storeForm, botToken: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2" placeholder="Bot token" />
            <textarea value={storeForm.welcomeMessage} onChange={(e) => setStoreForm({ ...storeForm, welcomeMessage: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Welcome message" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveStore} className="flex-1 bg-blue-600 text-white py-2 rounded-lg">Save</button>
              <Button onClick={() => setShowStoreForm(false)} className="px-4 py-2 bg-gray-100 rounded-lg">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showZoneForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="font-bold mb-4">{editingZoneId ? 'Edit Zone' : 'New Zone'}</h3>
            {!editingZoneId && (
              <select value={zoneForm.storeId} onChange={(e) => setZoneForm({ ...zoneForm, storeId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2">
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            )}
            <input value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2" placeholder="Zone name" />
            <input type="number" value={zoneForm.price} onChange={(e) => setZoneForm({ ...zoneForm, price: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2" placeholder="Price" />
            <input type="number" value={zoneForm.freeFrom} onChange={(e) => setZoneForm({ ...zoneForm, freeFrom: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Free from" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveZone} className="flex-1 bg-blue-600 text-white py-2 rounded-lg">Save</button>
              <Button onClick={() => setShowZoneForm(false)} className="px-4 py-2 bg-gray-100 rounded-lg">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
