import React, { useEffect, useMemo, useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../api/system-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

type InvoiceStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
type ActivityType = 'TENANT_PLAN_UPDATED' | 'INVOICE_CONFIRMED' | 'INVOICE_REJECTED';
type ActivityTarget = 'tenant' | 'invoice';

export default function SystemAdmin() {
  const { tr, locale } = useAdminI18n();
  const [loggedIn, setLoggedIn] = useState(!!sessionStorage.getItem('systemToken'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const [dashboard, setDashboard] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | ''>('');
  const [invoiceSearch, setInvoiceSearch] = useState('');

  const [activityType, setActivityType] = useState<ActivityType | ''>('');
  const [activityTarget, setActivityTarget] = useState<ActivityTarget | ''>('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');

  const statusLabel = useMemo(
    () => ({
      PENDING: tr('Ожидает', 'Kutilmoqda'),
      PAID: tr('Оплачен', "To'langan"),
      CANCELLED: tr('Отклонен', 'Rad etilgan'),
      EXPIRED: tr('Просрочен', "Muddati o'tgan"),
    }),
    [tr]
  );

  const activityTypeLabel = useMemo(
    () => ({
      TENANT_PLAN_UPDATED: tr('План обновлен', 'Tarif yangilandi'),
      INVOICE_CONFIRMED: tr('Инвойс подтвержден', 'Invoice tasdiqlandi'),
      INVOICE_REJECTED: tr('Инвойс отклонен', 'Invoice rad etildi'),
    }),
    [tr]
  );

  async function load() {
    setLoading(true);
    try {
      const invoiceQuery = new URLSearchParams();
      invoiceQuery.set('page', '1');
      invoiceQuery.set('pageSize', '30');
      if (invoiceStatus) invoiceQuery.set('status', invoiceStatus);
      if (invoiceSearch.trim()) invoiceQuery.set('search', invoiceSearch.trim());

      const activityQuery = new URLSearchParams();
      activityQuery.set('limit', '200');
      if (activityType) activityQuery.set('action', activityType);
      if (activityTarget) activityQuery.set('targetType', activityTarget);
      if (activitySearch.trim()) activityQuery.set('search', activitySearch.trim());
      if (activityDateFrom) activityQuery.set('dateFrom', new Date(activityDateFrom).toISOString());
      if (activityDateTo) {
        const end = new Date(activityDateTo);
        end.setHours(23, 59, 59, 999);
        activityQuery.set('dateTo', end.toISOString());
      }

      const [d, h, a, t, s, inv] = await Promise.all([
        systemApi.dashboard(),
        systemApi.health(),
        systemApi.activity(activityQuery.toString()),
        systemApi.tenants('page=1&pageSize=30'),
        systemApi.stores('page=1&pageSize=30'),
        systemApi.invoices(invoiceQuery.toString()),
      ]);

      setDashboard(d);
      setHealth(h);
      setActivity(Array.isArray(a) ? a : []);
      setTenants(Array.isArray(t?.items) ? t.items : []);
      setStores(Array.isArray(s?.items) ? s.items : []);
      setInvoices(Array.isArray(inv?.items) ? inv.items : []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function exportActivityCsv() {
    if (activity.length === 0) return;

    const escape = (v: unknown) => {
      const raw = String(v ?? '');
      return `"${raw.replace(/"/g, '""')}"`;
    };

    const rows = [
      ['time', 'type', 'message', 'actor', 'targetId', 'tenantName'],
      ...activity.map((item) => [
        new Date(item.at).toISOString(),
        item.type || '',
        item.message || '',
        item.actor || '',
        item.context?.targetId || item.context?.invoiceId || item.context?.tenantId || '',
        item.context?.tenantName || '',
      ]),
    ];

    const csv = rows.map((row) => row.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-activity-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <p className="sg-subtitle">{tr('Operations, billing moderation and platform control.', 'Operatsiyalar, billing moderatsiyasi va platforma nazorati.')}</p>
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
          <div className="sg-kpi-label">{tr('Pending invoices', 'Kutilayotgan invoice')}</div>
          <div className="sg-kpi-value">{dashboard?.pendingInvoices ?? '-'}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Monthly orders', 'Oylik buyurtmalar')}</div>
          <div className="sg-kpi-value">{dashboard?.monthlyOrders ?? '-'}</div>
        </article>
      </div>

      <section className="sg-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('System health', 'Tizim holati')}</h3>
          <span className="sg-badge" style={{ background: health?.status === 'ok' ? '#e8f7ef' : '#fff1f2', color: health?.status === 'ok' ? '#0f7a4f' : '#be123c' }}>
            {health?.status === 'ok' ? tr('Healthy', "Sog'lom") : tr('Degraded', 'Nosoz')}
          </span>
        </div>
        <div className="sg-grid cols-4" style={{ marginTop: 10 }}>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">DB</div>
            <div style={{ fontWeight: 800 }}>{health?.db?.ok ? tr('Connected', 'Ulangan') : tr('Unavailable', 'Mavjud emas')}</div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">DB ms</div>
            <div style={{ fontWeight: 800 }}>{health?.db?.latencyMs ?? '-'}</div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">Uptime</div>
            <div style={{ fontWeight: 800 }}>{health?.runtime?.uptimeSec ?? '-'}s</div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">Memory</div>
            <div style={{ fontWeight: 800 }}>{health?.runtime?.memoryMb ?? '-'} MB</div>
          </div>
        </div>
      </section>

      <div className="sg-grid cols-2">
        <article className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Invoices moderation', 'Invoice moderatsiyasi')}</h3>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <select
              value={invoiceStatus}
              onChange={(e) => setInvoiceStatus(e.target.value as InvoiceStatus | '')}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{tr('All statuses', 'Barcha statuslar')}</option>
              <option value="PENDING">{statusLabel.PENDING}</option>
              <option value="PAID">{statusLabel.PAID}</option>
              <option value="CANCELLED">{statusLabel.CANCELLED}</option>
              <option value="EXPIRED">{statusLabel.EXPIRED}</option>
            </select>
            <input
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              placeholder={tr('Tenant / payment ref search', 'Tenant / payment ref qidirish')}
              className="border rounded-lg px-3 py-2 text-sm"
              style={{ minWidth: 240 }}
            />
            <Button onClick={() => void load()} className="sg-btn ghost">{tr('Apply', "Qo'llash")}</Button>
          </div>

          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
            {invoices.map((invoice) => (
              <div key={invoice.id} className="sg-card soft" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{invoice.tenant?.name || invoice.tenantId}</p>
                  <span className="sg-badge" style={{ background: '#f3f4f6', color: '#374151' }}>{statusLabel[invoice.status as InvoiceStatus] || invoice.status}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{Number(invoice.amount).toLocaleString()} UZS</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#738178' }}>{invoice.paymentRef || tr('No payment ref', "Payment ref yo'q")}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#738178' }}>{new Date(invoice.createdAt).toLocaleString(locale)}</p>
                {invoice.status === 'PENDING' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <Button onClick={() => moderateInvoice(invoice.id, 'confirm')} className="sg-btn primary">
                      {tr('Confirm', 'Tasdiqlash')}
                    </Button>
                    <Button onClick={() => moderateInvoice(invoice.id, 'reject')} className="sg-btn danger">
                      {tr('Reject', 'Rad etish')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {invoices.length === 0 && <p className="sg-subtitle">{tr('No invoices found', 'Invoice topilmadi')}</p>}
          </div>
        </article>

        <article className="sg-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Action log', 'Harakatlar jurnali')}</h3>
            <Button onClick={exportActivityCsv} className="sg-btn ghost">CSV</Button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <select value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityType | '')} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">{tr('All actions', 'Barcha harakatlar')}</option>
              <option value="TENANT_PLAN_UPDATED">{activityTypeLabel.TENANT_PLAN_UPDATED}</option>
              <option value="INVOICE_CONFIRMED">{activityTypeLabel.INVOICE_CONFIRMED}</option>
              <option value="INVOICE_REJECTED">{activityTypeLabel.INVOICE_REJECTED}</option>
            </select>
            <select value={activityTarget} onChange={(e) => setActivityTarget(e.target.value as ActivityTarget | '')} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">{tr('All targets', 'Barcha obyektlar')}</option>
              <option value="tenant">{tr('Tenants', 'Tenantlar')}</option>
              <option value="invoice">{tr('Invoices', 'Invoicelar')}</option>
            </select>
            <input value={activitySearch} onChange={(e) => setActivitySearch(e.target.value)} placeholder={tr('Search actor/target', 'Ijrochi/obyekt qidirish')} className="border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={activityDateFrom} onChange={(e) => setActivityDateFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={activityDateTo} onChange={(e) => setActivityDateTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            <Button onClick={() => void load()} className="sg-btn ghost">{tr('Apply', "Qo'llash")}</Button>
          </div>

          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
            {activity.map((item) => (
              <div key={item.id} className="sg-card soft" style={{ padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{activityTypeLabel[item.type as ActivityType] || item.message}</strong>
                  <span style={{ fontSize: 12, color: '#64756b' }}>{new Date(item.at).toLocaleString(locale)}</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64756b' }}>{item.context?.tenantName || item.context?.tenantId || '-'}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64756b' }}>{tr('Actor', 'Ijrochi')}: {item.actor || 'system'}</p>
              </div>
            ))}
            {activity.length === 0 && <p className="sg-subtitle">{tr('No activity yet', "Hali harakatlar yo'q")}</p>}
          </div>
        </article>
      </div>

      <div className="sg-grid cols-2">
        <article className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Tenants', 'Tenantlar')}</h3>
          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
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

        <article className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Stores', "Do'konlar")}</h3>
          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
            {stores.map((store) => (
              <div key={store.id} className="sg-card soft" style={{ padding: 10 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{store.name}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#738178' }}>{store.tenant?.name || '-'}</p>
              </div>
            ))}
          </div>
        </article>
      </div>

      {loading && <p className="sg-subtitle">{tr('Updating...', 'Yangilanmoqda...')}</p>}
    </section>
  );
}
