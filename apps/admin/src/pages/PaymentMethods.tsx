import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/client';
import Button from '../components/Button';

const PROVIDERS = ['CASH', 'MANUAL_TRANSFER', 'CLICK', 'PAYME', 'UZUM', 'STRIPE', 'CUSTOM'];

export default function PaymentMethods() {
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [methods, setMethods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    provider: 'CUSTOM',
    code: '',
    title: '',
    description: '',
    instructions: '',
    isDefault: false,
    isActive: true,
    sortOrder: 0,
  });

  async function loadStores() {
    const list = await adminApi.getStores();
    const normalized = Array.isArray(list) ? list : [];
    setStores(normalized);
    if (!storeId && normalized[0]?.id) setStoreId(normalized[0].id);
  }

  async function loadMethods(targetStoreId: string) {
    if (!targetStoreId) return;
    const list = await adminApi.getStorePaymentMethods(targetStoreId);
    setMethods(Array.isArray(list) ? list : []);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      await loadStores();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (storeId) loadMethods(storeId);
  }, [storeId]);

  const canSave = useMemo(() => form.code.trim() && form.title.trim(), [form]);

  function openCreate() {
    setEditing(null);
    setForm({
      provider: 'CUSTOM',
      code: '',
      title: '',
      description: '',
      instructions: '',
      isDefault: false,
      isActive: true,
      sortOrder: methods.length,
    });
    setFormOpen(true);
  }

  function openEdit(method: any) {
    setEditing(method);
    setForm({
      provider: method.provider || 'CUSTOM',
      code: method.code || '',
      title: method.title || '',
      description: method.description || '',
      instructions: method.instructions || '',
      isDefault: !!method.isDefault,
      isActive: method.isActive !== false,
      sortOrder: method.sortOrder || 0,
    });
    setFormOpen(true);
  }

  async function save() {
    if (!canSave || !storeId) return;
    setSaving(true);
    try {
      if (editing) {
        await adminApi.updateStorePaymentMethod(storeId, editing.id, form);
      } else {
        await adminApi.createStorePaymentMethod(storeId, form);
      }
      setFormOpen(false);
      await loadMethods(storeId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function archiveMethod(methodId: string) {
    if (!confirm('Archive this payment method?')) return;
    try {
      await adminApi.deleteStorePaymentMethod(storeId, methodId);
      await loadMethods(storeId);
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) return <p className="text-gray-400">Loading payment methods...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 className="text-2xl font-bold">Payment Methods</h2>
          <p className="text-sm text-gray-500">Store owners can configure multiple payment options for checkout.</p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
          + Add Method
        </Button>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="text-sm text-gray-500">Store</label>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((method) => (
              <tr key={method.id} className="border-t">
                <td className="px-4 py-3">
                  <p className="font-medium">{method.title}</p>
                  {method.description && <p className="text-xs text-gray-500">{method.description}</p>}
                </td>
                <td className="px-4 py-3">{method.provider}</td>
                <td className="px-4 py-3">{method.code}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-1 rounded bg-gray-100 mr-1">{method.isActive ? 'active' : 'inactive'}</span>
                  {method.isDefault && <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">default</span>}
                </td>
                <td className="px-4 py-3">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button onClick={() => openEdit(method)} className="px-2 py-1 rounded bg-blue-50 text-blue-700">Edit</Button>
                    <Button onClick={() => archiveMethod(method.id)} className="px-2 py-1 rounded bg-red-50 text-red-700">Archive</Button>
                  </div>
                </td>
              </tr>
            ))}
            {methods.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No payment methods configured.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <h3 className="font-bold mb-4">{editing ? 'Edit Payment Method' : 'Create Payment Method'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Code</label>
                <input value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-gray-500">Title</label>
              <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="mt-3">
              <label className="text-xs text-gray-500">Description</label>
              <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="mt-3">
              <label className="text-xs text-gray-500">Instructions</label>
              <textarea value={form.instructions} onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))} />
                Default
              </label>
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
                Active
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={save}
                disabled={!canSave || saving}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <Button onClick={() => setFormOpen(false)} className="px-5 py-2 bg-gray-100 rounded-lg">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
