import React, { useEffect, useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../api/system-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

export default function SystemAdmin() {
  const { tr } = useAdminI18n();
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
    if (loggedIn) void load();
  }, [loggedIn]);

  async function login() {
    setLoginError('');
    setLoading(true);
    try {
      const data = await systemApi.login(email.trim(), password);
      if (data?.token) setSystemToken(data.token);
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

  function goToStoreAdmin() {
    clearSystemToken();
    window.location.hash = '/';
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
      <section className="sg-page" style={{ maxWidth: 460, margin: '20px auto' }}>
        <h2 className="sg-title" style={{ fontSize: 28 }}>{tr('Global system admin', 'Global tizim admini')}</h2>
        <p className="sg-subtitle">{tr('Separate console for platform governance and subscription moderation.', 'Platformani boshqarish va obuna moderatsiyasi uchun alohida konsol.')}</p>

        <div className="sg-grid" style={{ marginTop: 14 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr('Password', 'Parol')} className="w-full border rounded-lg px-3 py-2 text-sm" />
          {loginError && <p style={{ color: '#b91c1c', fontSize: 13 }}>{loginError}</p>}
          <button onClick={login} disabled={loading} className="sg-btn primary" style={{ width: '100%' }}>
            {loading ? tr('Signing in...', 'Kirilmoqda...') : tr('Sign in', 'Kirish')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
        <div>
          <h2 className="sg-title">{tr('System admin console', 'Tizim admin konsoli')}</h2>
          <p className="sg-subtitle">{tr('Platform governance, subscription plans and invoice moderation.', 'Platformani boshqarish, obuna rejalari va invoice moderatsiyasi.')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={goToStoreAdmin} className="sg-btn ghost">
            {tr('Store admin panel', "Do'kon admin paneli")}
          </Button>
          <Button onClick={logout} className="sg-btn danger">
            {tr('Sign out', 'Chiqish')}
          </Button>
        </div>
      </header>

      <div className="sg-grid cols-4">
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Tenants', 'Tenantlar')}</div>
          <div className="sg-kpi-value">{dashboard?.tenants ?? '-'}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Active stores', "Faol do'konlar")}</div>
          <div className="sg-kpi-value">{dashboard?.activeStores ?? '-'}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Pending invoices', "Ko'rib chiqilayotgan invoice")}</div>
          <div className="sg-kpi-value">{dashboard?.pendingInvoices ?? '-'}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Monthly orders', 'Oylik buyurtmalar')}</div>
          <div className="sg-kpi-value">{dashboard?.monthlyOrders ?? '-'}</div>
        </article>
      </div>

      <div className="sg-grid cols-2">
        <article className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Tenants', 'Tenantlar')}</h3>
          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 480, overflow: 'auto' }}>
            {tenants.map((tenant) => (
              <div key={tenant.id} className="sg-card soft" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700 }}>{tenant.name}</p>
                    <p style={{ margin: 0, color: '#708076', fontSize: 12 }}>{tenant.slug}</p>
                  </div>
                  <span className="sg-badge" style={{ background: '#eef2ff', color: '#3730a3' }}>{tenant.plan}</span>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button onClick={() => setPlan(tenant.id, 'FREE')} className="sg-btn ghost">FREE</Button>
                  <Button onClick={() => setPlan(tenant.id, 'PRO')} className="sg-btn ghost">PRO</Button>
                  <Button onClick={() => setPlan(tenant.id, 'BUSINESS')} className="sg-btn ghost">BUSINESS</Button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="sg-grid" style={{ gap: 12 }}>
          <section className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Invoices moderation', 'Invoice moderatsiyasi')}</h3>
            <div className="sg-grid" style={{ marginTop: 12, maxHeight: 270, overflow: 'auto' }}>
              {invoices.map((invoice) => (
                <div key={invoice.id} className="sg-card soft" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{invoice.tenant?.name || invoice.tenantId}</p>
                    <span className="sg-badge" style={{ background: '#f3f4f6', color: '#374151' }}>{invoice.plan}</span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{Number(invoice.amount).toLocaleString()} UZS</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#738178' }}>{invoice.paymentRef || tr('No payment ref', "Payment ref yo'q")}</p>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <Button onClick={() => moderateInvoice(invoice.id, 'confirm')} className="sg-btn primary">
                      {tr('Confirm', 'Tasdiqlash')}
                    </Button>
                    <Button onClick={() => moderateInvoice(invoice.id, 'reject')} className="sg-btn danger">
                      {tr('Reject', 'Rad etish')}
                    </Button>
                  </div>
                </div>
              ))}
              {invoices.length === 0 && <p className="sg-subtitle">{tr('No invoices pending moderation', "Ko'rib chiqilayotgan invoice yo'q")}</p>}
            </div>
          </section>

          <section className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Stores', "Do'konlar")}</h3>
            <div className="sg-grid" style={{ marginTop: 12, maxHeight: 190, overflow: 'auto' }}>
              {stores.map((store) => (
                <div key={store.id} className="sg-card soft" style={{ padding: 10 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{store.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#738178' }}>{store.tenant?.name || '-'}</p>
                </div>
              ))}
            </div>
          </section>
        </article>
      </div>

      {loading && <p className="sg-subtitle">{tr('Updating...', 'Yangilanmoqda...')}</p>}
    </section>
  );
}
