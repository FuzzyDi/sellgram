import React, { useEffect, useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../api/client';
import Button from '../components/Button';

export default function SystemAdmin() {
  const [loggedIn, setLoggedIn] = useState(!!sessionStorage.getItem('systemToken'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [d, t, s, i] = await Promise.all([
        systemApi.dashboard(),
        systemApi.tenants('page=1&pageSize=30'),
        systemApi.stores('page=1&pageSize=30'),
        systemApi.pendingInvoices(),
      ]);
      setDashboard(d);
      setTenants(Array.isArray(t?.items) ? t.items : []);
      setStores(Array.isArray(s?.items) ? s.items : []);
      setInvoices(Array.isArray(i) ? i : []);
    } catch (err: any) {
      clearSystemToken();
      setLoggedIn(false);
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn]);

  async function login() {
    setLoginError('');
    setLoading(true);
    try {
      const data = await systemApi.login(email.trim(), password);
      if (data?.token) {
        setSystemToken(data.token);
      }
      setLoggedIn(true);
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearSystemToken();
    setLoggedIn(false);
  }

  async function setPlan(tenantId: string, plan: 'FREE' | 'PRO' | 'BUSINESS') {
    try {
      await systemApi.setTenantPlan(tenantId, plan);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function moderateInvoice(id: string, action: 'confirm' | 'reject') {
    try {
      if (action === 'confirm') await systemApi.confirmInvoice(id);
      else await systemApi.rejectInvoice(id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (!loggedIn) {
    return (
      <div style={{ maxWidth: 420, margin: '50px auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24 }}>
        <h2 className="text-2xl font-bold mb-1">System Admin</h2>
        <p className="text-sm text-gray-500 mb-4">Separate global control panel for the whole platform.</p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
        />
        {loginError && <p className="text-sm text-red-600 mb-2">{loginError}</p>}
        <button onClick={login} disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50">
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 className="text-2xl font-bold">System Admin Console</h2>
          <p className="text-sm text-gray-500">Global moderation and platform-level controls.</p>
        </div>
        <Button onClick={logout} className="px-3 py-2 text-sm bg-gray-100 rounded-lg">Logout</Button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Tenants', value: dashboard?.tenants ?? '-' },
          { label: 'Active Stores', value: dashboard?.activeStores ?? '-' },
          { label: 'Pending Invoices', value: dashboard?.pendingInvoices ?? '-' },
          { label: 'Monthly Orders', value: dashboard?.monthlyOrders ?? '-' },
        ].map((item) => (
          <div key={item.label} className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="text-2xl font-bold mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold mb-3">Tenants</h3>
          <div className="space-y-2 max-h-96 overflow-auto">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="border rounded-lg p-3">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <p className="font-medium">{tenant.name}</p>
                    <p className="text-xs text-gray-500">{tenant.slug}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-gray-100">{tenant.plan}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => setPlan(tenant.id, 'FREE')} className="px-2 py-1 text-xs rounded bg-gray-100">FREE</Button>
                  <Button onClick={() => setPlan(tenant.id, 'PRO')} className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">PRO</Button>
                  <Button onClick={() => setPlan(tenant.id, 'BUSINESS')} className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-700">BUSINESS</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold mb-3">Pending Invoices</h3>
          <div className="space-y-2 max-h-56 overflow-auto mb-4">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="border rounded-lg p-3">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <p className="font-medium">{invoice.tenant?.name || invoice.tenantId}</p>
                  <span className="text-xs">{invoice.plan}</span>
                </div>
                <p className="text-sm">{Number(invoice.amount).toLocaleString()} UZS</p>
                <p className="text-xs text-gray-500 mt-1">{invoice.paymentRef || 'No payment ref'}</p>
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => moderateInvoice(invoice.id, 'confirm')} className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">Confirm</Button>
                  <Button onClick={() => moderateInvoice(invoice.id, 'reject')} className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">Reject</Button>
                </div>
              </div>
            ))}
            {invoices.length === 0 && <p className="text-sm text-gray-400">No pending invoices.</p>}
          </div>

          <h3 className="font-semibold mb-3">Stores</h3>
          <div className="space-y-2 max-h-40 overflow-auto">
            {stores.map((store) => (
              <div key={store.id} className="border rounded-lg p-2">
                <p className="text-sm font-medium">{store.name}</p>
                <p className="text-xs text-gray-500">{store.tenant?.name || '-'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
