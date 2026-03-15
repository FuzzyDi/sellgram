import React, { useEffect, useMemo, useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../api/system-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

type InvoiceStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
type ActivityType = 'TENANT_PLAN_UPDATED' | 'INVOICE_CONFIRMED' | 'INVOICE_REJECTED';
type ActivityTarget = 'tenant' | 'invoice';
type NoticeTone = 'success' | 'error' | 'info';

/* ── helpers ─────────────────────────────────────────────── */

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: ok ? '#00b96b' : '#ef4444',
        marginRight: 6,
        flexShrink: 0,
        boxShadow: ok ? '0 0 0 2px rgba(0,185,107,0.2)' : '0 0 0 2px rgba(239,68,68,0.2)',
      }}
    />
  );
}

function invoiceBadgeStyle(status: InvoiceStatus): React.CSSProperties {
  switch (status) {
    case 'PAID':      return { background: '#d1fae5', color: '#065f46' };
    case 'PENDING':   return { background: '#fef3c7', color: '#92400e' };
    case 'CANCELLED': return { background: '#fee2e2', color: '#991b1b' };
    case 'EXPIRED':   return { background: '#f3f4f6', color: '#4b5563' };
    default:          return { background: '#f3f4f6', color: '#374151' };
  }
}

function planBadgeStyle(plan: string): React.CSSProperties {
  switch (plan) {
    case 'PRO':      return { background: '#ede9fe', color: '#5b21b6' };
    case 'BUSINESS': return { background: '#fef3c7', color: '#92400e' };
    default:         return { background: '#f3f4f6', color: '#374151' };
  }
}

function latencyColor(ms: number | null | undefined): string {
  if (ms == null) return '#6b7280';
  if (ms < 50) return '#059669';
  if (ms < 150) return '#d97706';
  return '#dc2626';
}

export default function SystemAdmin() {
  const { tr, locale, lang, setLang } = useAdminI18n();

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
  const [reportUsage, setReportUsage] = useState<any[]>([]);
  const [reportUsageSummary, setReportUsageSummary] = useState<any>(null);
  const [reportUsageMonth, setReportUsageMonth] = useState('');
  const [users, setUsers] = useState<any[]>([]);

  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | ''>('');
  const [invoiceSearch, setInvoiceSearch] = useState('');

  const [activityType, setActivityType] = useState<ActivityType | ''>('');
  const [activityTarget, setActivityTarget] = useState<ActivityTarget | ''>('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');

  const [userSearch, setUserSearch] = useState('');
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});

  const [tenantPlanExpires, setTenantPlanExpires] = useState<Record<string, string>>({});

  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDaysInput, setReminderDaysInput] = useState('7,3,1');
  const [reminderSaving, setReminderSaving] = useState(false);

  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  const statusLabel = useMemo(
    () => ({
      PENDING: tr('\u041e\u0436\u0438\u0434\u0430\u0435\u0442', 'Kutilmoqda'),
      PAID: tr('\u041e\u043f\u043b\u0430\u0447\u0435\u043d', "To'langan"),
      CANCELLED: tr('\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d', 'Rad etilgan'),
      EXPIRED: tr('\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d', "Muddati o'tgan"),
    }),
    [tr]
  );

  const activityTypeLabel = useMemo(
    () => ({
      TENANT_PLAN_UPDATED: tr('\u0422\u0430\u0440\u0438\u0444 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d', 'Tarif yangilandi'),
      INVOICE_CONFIRMED: tr('\u0418\u043d\u0432\u043e\u0439\u0441 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d', 'Invoice tasdiqlandi'),
      INVOICE_REJECTED: tr('\u0418\u043d\u0432\u043e\u0439\u0441 \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d', 'Invoice rad etildi'),
    }),
    [tr]
  );

  const formatMoney = (value: number | string | null | undefined) => `${Number(value || 0).toLocaleString(locale)} UZS`;

  function toDateInput(value?: string | null) {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  }

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  function parseReminderDaysInput(input: string): number[] {
    const parsed = input
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isInteger(x) && x >= 1 && x <= 30);
    return Array.from(new Set(parsed)).sort((a, b) => b - a);
  }

  async function load() {
    setLoading(true);
    try {
      const invoiceQuery = new URLSearchParams();
      invoiceQuery.set('page', '1');
      invoiceQuery.set('pageSize', '50');
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

      const reportUsageQuery = 'page=1&pageSize=50' + (reportUsageMonth ? '&month=' + encodeURIComponent(reportUsageMonth) : '');
      const usersQuery = 'page=1&pageSize=100' + (userSearch.trim() ? '&search=' + encodeURIComponent(userSearch.trim()) : '');

      const [d, h, a, t, s, inv, ru, us] = await Promise.all([
        systemApi.dashboard(),
        systemApi.health(),
        systemApi.activity(activityQuery.toString()),
        systemApi.tenants('page=1&pageSize=50'),
        systemApi.stores('page=1&pageSize=50'),
        systemApi.invoices(invoiceQuery.toString()),
        systemApi.reportUsage(reportUsageQuery),
        systemApi.users(usersQuery),
      ]);

      setDashboard(d);
      setHealth(h);
      setReminderEnabled(Boolean(h?.subscriptionReminders?.enabled));
      setReminderDaysInput(Array.isArray(h?.subscriptionReminders?.days) ? h.subscriptionReminders.days.join(',') : '7,3,1');
      setActivity(Array.isArray(a) ? a : []);

      const tenantItems = Array.isArray(t?.items) ? t.items : [];
      setTenants(tenantItems);
      setTenantPlanExpires(
        tenantItems.reduce((acc: Record<string, string>, tenant: any) => {
          acc[tenant.id] = toDateInput(tenant.planExpiresAt);
          return acc;
        }, {})
      );

      setStores(Array.isArray(s?.items) ? s.items : []);
      setInvoices(Array.isArray(inv?.items) ? inv.items : []);
      setReportUsage(Array.isArray(ru?.items) ? ru.items : []);
      setReportUsageSummary(ru?.summary || null);
      setUsers(Array.isArray(us?.items) ? us.items : []);
      if (!reportUsageMonth && ru?.monthKey) setReportUsageMonth(String(ru.monthKey));
    } catch (err: any) {
      clearSystemToken();
      setLoggedIn(false);
      setLoginError(err?.message || 'System session expired');
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
      setLoginError(err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u0445\u043e\u0434\u0430', 'Kirish xatosi'));
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

  async function saveReminderSettings() {
    const days = parseReminderDaysInput(reminderDaysInput);
    if (days.length === 0) {
      showNotice('error', tr('\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0434\u043d\u0438 \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043f\u044f\u0442\u0443\u044e, \u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: 7,3,1', 'Kunlarni vergul bilan kiriting: 7,3,1'));
      return;
    }

    setReminderSaving(true);
    try {
      const data = await systemApi.updateReminderSettings({ enabled: reminderEnabled, days });
      setReminderEnabled(Boolean(data?.enabled));
      setReminderDaysInput(Array.isArray(data?.days) ? data.days.join(',') : days.join(','));
      await load();
      showNotice('success', tr('\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0439 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b', 'Eslatma sozlamalari saqlandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f', 'Saqlashda xato'));
    } finally {
      setReminderSaving(false);
    }
  }

  async function setPlan(tenantId: string, plan: 'FREE' | 'PRO' | 'BUSINESS') {
    try {
      const expires = tenantPlanExpires[tenantId]?.trim();
      await systemApi.setTenantPlan(tenantId, plan, expires || undefined);
      await load();
      showNotice('success', tr('\u0422\u0430\u0440\u0438\u0444 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d', 'Tarif yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
    }
  }

  async function moderateInvoice(id: string, action: 'confirm' | 'reject') {
    try {
      if (action === 'confirm') await systemApi.confirmInvoice(id);
      else await systemApi.rejectInvoice(id);
      await load();
      showNotice(
        'success',
        action === 'confirm'
          ? tr('\u0418\u043d\u0432\u043e\u0439\u0441 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d', 'Invoice tasdiqlandi')
          : tr('\u0418\u043d\u0432\u043e\u0439\u0441 \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d', 'Invoice rad etildi')
      );
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
    }
  }

  async function resetUserPassword(userId: string, userEmail: string) {
    const newPassword = (resetPasswords[userId] || '').trim();
    if (newPassword.length < 6) {
      showNotice('error', tr('\u041f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u043c\u0438\u043d\u0438\u043c\u0443\u043c 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432', "Parol kamida 6 belgidan iborat bo'lsin"));
      return;
    }

    try {
      await systemApi.resetUserPassword(userId, newPassword);
      setResetPasswords((prev) => ({ ...prev, [userId]: '' }));
      showNotice('success', tr(`\u041f\u0430\u0440\u043e\u043b\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d: ${userEmail}`, `${userEmail} uchun parol yangilandi`));
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0431\u0440\u043e\u0441\u0430 \u043f\u0430\u0440\u043e\u043b\u044f', 'Parolni tiklashda xato'));
    }
  }

  /* ── toast ───────────────────────────────────────────────── */

  const noticeNode = notice ? (
    <div
      style={{
        position: 'fixed',
        right: 16,
        top: 16,
        zIndex: 200,
        minWidth: 260,
        maxWidth: 420,
        borderRadius: 12,
        padding: '12px 16px',
        color: notice.tone === 'error' ? '#991b1b' : notice.tone === 'success' ? '#065f46' : '#1e3a8a',
        background: notice.tone === 'error' ? '#fee2e2' : notice.tone === 'success' ? '#d1fae5' : '#dbeafe',
        border: `1px solid ${notice.tone === 'error' ? '#fecaca' : notice.tone === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
        fontSize: 13,
        fontWeight: 700,
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        animation: 'sg-fade-in 0.2s ease both',
      }}
    >
      {notice.message}
    </div>
  ) : null;

  /* ── login screen ────────────────────────────────────────── */

  if (!loggedIn) {
    return (
      <>
        {noticeNode}
        <section className="sg-page" style={{ maxWidth: 460, margin: '40px auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14, gap: 6 }}>
            {(['ru', 'uz'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className="sg-btn ghost"
                style={{ fontWeight: 800, fontSize: 12, padding: '4px 12px', ...(lang === l ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : {}) }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <h2 className="sg-title" style={{ fontSize: 26 }}>
            {tr('\u041a\u043e\u043d\u0441\u043e\u043b\u044c \u0441\u0438\u0441\u0442\u0435\u043c\u043d\u043e\u0433\u043e \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430', 'Tizim administratori konsoli')}
          </h2>
          <p className="sg-subtitle">
            {tr('\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0434\u043b\u044f \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u043f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u043e\u0439, \u0431\u0438\u043b\u043b\u0438\u043d\u0433\u043e\u043c \u0438 \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c\u044e.', 'Platforma, billing va xavfsizlikni boshqarish uchun kiring.')}
          </p>
          <div className="sg-grid" style={{ marginTop: 16 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && void login()}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tr('\u041f\u0430\u0440\u043e\u043b\u044c', 'Parol')}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && void login()}
            />
            {loginError && <p style={{ color: '#b91c1c', fontSize: 13, margin: 0 }}>{loginError}</p>}
            <button onClick={() => void login()} disabled={loading} className="sg-btn primary" style={{ width: '100%' }}>
              {loading ? tr('\u0412\u0445\u043e\u0434...', 'Kirilmoqda...') : tr('\u0412\u043e\u0439\u0442\u0438', 'Kirish')}
            </button>
          </div>
        </section>
      </>
    );
  }

  /* ── main console ────────────────────────────────────────── */

  const dbOk = Boolean(health?.db?.ok);
  const dbMs: number | null = health?.db?.latencyMs ?? null;

  return (
    <>
      {noticeNode}
      <section className="sg-page sg-grid" style={{ gap: 18 }}>

        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 className="sg-title">{tr('\u041a\u043e\u043d\u0441\u043e\u043b\u044c \u0441\u0438\u0441\u0442\u0435\u043c\u043d\u043e\u0433\u043e \u0430\u0434\u043c\u0438\u043d\u0430', 'Tizim admin konsoli')}</h2>
            <p className="sg-subtitle">{tr('\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u0438, \u043c\u043e\u0434\u0435\u0440\u0430\u0446\u0438\u044f billing \u0438 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u043f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u044b.', 'Operatsiyalar, billing moderatsiyasi va platforma nazorati.')}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['ru', 'uz'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className="sg-btn ghost"
                style={{ fontWeight: 800, fontSize: 12, padding: '4px 12px', ...(lang === l ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : {}) }}
              >
                {l.toUpperCase()}
              </button>
            ))}
            <Button onClick={goToStoreAdmin} className="sg-btn ghost">{tr('\u041f\u0430\u043d\u0435\u043b\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430', "Do'kon paneli")}</Button>
            <Button onClick={logout} className="sg-btn danger">{tr('\u0412\u044b\u0445\u043e\u0434', 'Chiqish')}</Button>
          </div>
        </header>

        {/* KPI row */}
        <div className="sg-grid cols-4">
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('\u0422\u0435\u043d\u0430\u043d\u0442\u044b', 'Tenantlar')}</div>
            <div className="sg-kpi-value">{dashboard?.tenants ?? '-'}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u044b', "Faol do'konlar")}</div>
            <div className="sg-kpi-value">{dashboard?.activeStores ?? '-'}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('\u0421\u0447\u0435\u0442\u0430 \u043d\u0430 \u043c\u043e\u0434\u0435\u0440\u0430\u0446\u0438\u0438', 'Moderatsiyadagi invoice')}</div>
            <div className="sg-kpi-value" style={{ color: (dashboard?.pendingInvoices ?? 0) > 0 ? '#d97706' : undefined }}>
              {dashboard?.pendingInvoices ?? '-'}
            </div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('\u0421\u0443\u043c\u043c\u0430 \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u044f', 'Kutilayotgan summa')}</div>
            <div className="sg-kpi-value">{formatMoney(dashboard?.pendingAmount)}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('\u041e\u043f\u043b\u0430\u0447\u0435\u043d\u043e (\u043c\u0435\u0441\u044f\u0446)', "To'langan (oy)")}</div>
            <div className="sg-kpi-value">{dashboard?.paidInvoicesMonth ?? '-'}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('\u0412\u044b\u0440\u0443\u0447\u043a\u0430 \u0438\u043d\u0432\u043e\u0439\u0441\u043e\u0432 (\u043c\u0435\u0441\u044f\u0446)', 'Invoice tushumi (oy)')}</div>
            <div className="sg-kpi-value">{formatMoney(dashboard?.paidRevenueMonth)}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('\u0417\u0430\u043a\u0430\u0437\u044b \u0437\u0430 \u043c\u0435\u0441\u044f\u0446', 'Oylik buyurtmalar')}</div>
            <div className="sg-kpi-value">{dashboard?.monthlyOrders ?? '-'}</div>
          </article>
        </div>

        {/* Users */}
        <section className="sg-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u043e\u0432', "Do'kon foydalanuvchilari")}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
                placeholder={tr('\u041f\u043e\u0438\u0441\u043a email / \u0438\u043c\u044f', 'Email / ism qidirish')}
                onKeyDown={(e) => e.key === 'Enter' && void load()}
              />
              <Button onClick={() => void load()} className="sg-btn ghost">{tr('\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c', "Qo'llash")}</Button>
            </div>
          </div>
          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 320, overflow: 'auto' }}>
            {users.map((user) => (
              <div key={user.id} className="sg-card soft" style={{ padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{user.name} <span style={{ color: '#64756b', fontWeight: 400 }}>({user.email})</span></div>
                    <div style={{ fontSize: 12, color: '#64756b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {user.tenant?.name || '-'}
                      <span style={{ color: '#c8d6cd' }}>·</span>
                      <span style={{ fontWeight: 600 }}>{user.role}</span>
                      <span style={{ color: '#c8d6cd' }}>·</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <StatusDot ok={user.isActive} />
                        {user.isActive ? tr('\u0430\u043a\u0442\u0438\u0432\u0435\u043d', 'faol') : tr('\u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d', "o'chirilgan")}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="password"
                      value={resetPasswords[user.id] || ''}
                      onChange={(e) => setResetPasswords((prev) => ({ ...prev, [user.id]: e.target.value }))}
                      className="border rounded-lg px-3 py-2 text-sm"
                      placeholder={tr('\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'Yangi parol')}
                    />
                    <Button onClick={() => void resetUserPassword(user.id, user.email)} className="sg-btn ghost">
                      {tr('\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c', 'Parolni tiklash')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {users.length === 0 && <p className="sg-subtitle">{tr('\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b', "Foydalanuvchilar yo'q")}</p>}
          </div>
        </section>

        {/* System health */}
        <section className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{tr('\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0441\u0438\u0441\u0442\u0435\u043c\u044b', 'Tizim holati')}</h3>
          <div className="sg-grid cols-4">
            {/* DB status */}
            <div className="sg-card soft" style={{ padding: 12 }}>
              <div className="sg-kpi-label">DB</div>
              <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', marginTop: 6 }}>
                <StatusDot ok={dbOk} />
                {dbOk ? tr('\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0430', 'Ulangan') : tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Nosoz')}
              </div>
            </div>
            {/* DB latency */}
            <div className="sg-card soft" style={{ padding: 12 }}>
              <div className="sg-kpi-label">DB latency</div>
              <div style={{ fontWeight: 800, marginTop: 6, color: latencyColor(dbMs) }}>
                {dbMs != null ? `${dbMs} ms` : '—'}
              </div>
            </div>
            {/* Uptime */}
            <div className="sg-card soft" style={{ padding: 12 }}>
              <div className="sg-kpi-label">{tr('\u0412\u0440\u0435\u043c\u044f \u0440\u0430\u0431\u043e\u0442\u044b', 'Ish vaqti')}</div>
              <div style={{ fontWeight: 800, marginTop: 6 }}>
                {health?.runtime?.uptimeSec != null ? `${health.runtime.uptimeSec}s` : '—'}
              </div>
            </div>
            {/* Memory */}
            <div className="sg-card soft" style={{ padding: 12 }}>
              <div className="sg-kpi-label">{tr('\u041f\u0430\u043c\u044f\u0442\u044c', 'Xotira')}</div>
              <div style={{ fontWeight: 800, marginTop: 6 }}>
                {health?.runtime?.memoryMb != null ? `${health.runtime.memoryMb} MB` : '—'}
              </div>
            </div>

            {/* Reminder settings — full width */}
            <div className="sg-card soft" style={{ padding: 14, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer' }}>
                  <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} style={{ accentColor: 'var(--sg-brand)', width: 16, height: 16 }} />
                  {tr('\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u043d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u044f', 'Eslatmalarni yoqish')}
                </label>
                <input
                  value={reminderDaysInput}
                  onChange={(e) => setReminderDaysInput(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                  style={{ minWidth: 200 }}
                  placeholder="7,3,1"
                />
                <Button onClick={() => void saveReminderSettings()} className="sg-btn primary" disabled={reminderSaving}>
                  {reminderSaving ? tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...', 'Saqlanmoqda...') : tr('\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c', 'Saqlash')}
                </Button>
              </div>
              <p className="sg-subtitle" style={{ marginTop: 6 }}>
                {tr('\u0414\u043d\u0438 \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043f\u044f\u0442\u0443\u044e, 1..30', 'Kunlar vergul bilan, 1..30')}
              </p>
            </div>
          </div>
        </section>

        {/* Invoices + Activity */}
        <div className="sg-grid cols-2">
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('\u041c\u043e\u0434\u0435\u0440\u0430\u0446\u0438\u044f \u0438\u043d\u0432\u043e\u0439\u0441\u043e\u0432', 'Invoice moderatsiyasi')}</h3>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as InvoiceStatus | '')} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">{tr('\u0412\u0441\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u044b', 'Barcha statuslar')}</option>
                <option value="PENDING">{statusLabel.PENDING}</option>
                <option value="PAID">{statusLabel.PAID}</option>
                <option value="CANCELLED">{statusLabel.CANCELLED}</option>
                <option value="EXPIRED">{statusLabel.EXPIRED}</option>
              </select>
              <input
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder={tr('\u041f\u043e\u0438\u0441\u043a tenant / payment ref', 'Tenant / payment ref qidirish')}
                className="border rounded-lg px-3 py-2 text-sm"
                style={{ minWidth: 200 }}
              />
              <Button onClick={() => void load()} className="sg-btn ghost">{tr('\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c', "Qo'llash")}</Button>
            </div>
            <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
              {invoices.map((invoice) => (
                <div key={invoice.id} className="sg-card soft" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{invoice.tenant?.name || invoice.tenantId}</p>
                    <span className="sg-badge" style={invoiceBadgeStyle(invoice.status)}>
                      {statusLabel[invoice.status as InvoiceStatus] || invoice.status}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontWeight: 700, fontSize: 15 }}>{formatMoney(invoice.amount)}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#738178' }}>{tr('\u0422\u0430\u0440\u0438\u0444', 'Tarif')}: <strong>{invoice.plan}</strong></p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#738178' }}>{invoice.paymentRef || tr('\u041d\u0435\u0442 payment ref', "Payment ref yo'q")}</p>
                  {invoice.status === 'PENDING' && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <Button onClick={() => void moderateInvoice(invoice.id, 'confirm')} className="sg-btn primary">
                        {tr('\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c', 'Tasdiqlash')}
                      </Button>
                      <Button onClick={() => void moderateInvoice(invoice.id, 'reject')} className="sg-btn danger">
                        {tr('\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c', 'Rad etish')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {invoices.length === 0 && <p className="sg-subtitle">{tr('\u0418\u043d\u0432\u043e\u0439\u0441\u044b \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b', 'Invoice topilmadi')}</p>}
            </div>
          </article>

          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('\u0416\u0443\u0440\u043d\u0430\u043b \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439', 'Harakatlar jurnali')}</h3>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <select value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityType | '')} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">{tr('\u0412\u0441\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f', 'Barcha harakatlar')}</option>
                <option value="TENANT_PLAN_UPDATED">{activityTypeLabel.TENANT_PLAN_UPDATED}</option>
                <option value="INVOICE_CONFIRMED">{activityTypeLabel.INVOICE_CONFIRMED}</option>
                <option value="INVOICE_REJECTED">{activityTypeLabel.INVOICE_REJECTED}</option>
              </select>
              <select value={activityTarget} onChange={(e) => setActivityTarget(e.target.value as ActivityTarget | '')} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">{tr('\u0412\u0441\u0435 \u043e\u0431\u044a\u0435\u043a\u0442\u044b', 'Barcha obyektlar')}</option>
                <option value="tenant">{tr('\u0422\u0435\u043d\u0430\u043d\u0442\u044b', 'Tenantlar')}</option>
                <option value="invoice">{tr('\u0418\u043d\u0432\u043e\u0439\u0441\u044b', 'Invoicelar')}</option>
              </select>
              <input value={activitySearch} onChange={(e) => setActivitySearch(e.target.value)} placeholder={tr('\u041f\u043e\u0438\u0441\u043a', 'Qidirish')} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={activityDateFrom} onChange={(e) => setActivityDateFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={activityDateTo} onChange={(e) => setActivityDateTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              <Button onClick={() => void load()} className="sg-btn ghost">{tr('\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c', "Qo'llash")}</Button>
            </div>
            <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
              {activity.map((item) => (
                <div key={item.id} className="sg-card soft" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13 }}>{activityTypeLabel[item.type as ActivityType] || item.message}</strong>
                    <span style={{ fontSize: 11, color: '#64756b' }}>{new Date(item.at).toLocaleString(locale)}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64756b' }}>{item.context?.tenantName || item.context?.tenantId || '—'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64756b' }}>
                    {tr('\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c', 'Ijrochi')}: {item.actor || tr('\u0441\u0438\u0441\u0442\u0435\u043c\u0430', 'tizim')}
                  </p>
                </div>
              ))}
              {activity.length === 0 && <p className="sg-subtitle">{tr('\u0421\u043e\u0431\u044b\u0442\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442', "Hali harakatlar yo'q")}</p>}
            </div>
          </article>
        </div>

        {/* Tenants + Stores */}
        <div className="sg-grid cols-2">
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('\u0422\u0435\u043d\u0430\u043d\u0442\u044b', 'Tenantlar')}</h3>
            <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
              {tenants.map((tenant) => (
                <div key={tenant.id} className="sg-card soft" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700 }}>{tenant.name}</p>
                      <p style={{ margin: 0, color: '#708076', fontSize: 12 }}>{tenant.slug}</p>
                    </div>
                    <span className="sg-badge" style={planBadgeStyle(tenant.plan)}>{tenant.plan}</span>
                  </div>
                  {tenant.planExpiresAt && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#708076' }}>
                      {tr('\u0414\u043e', 'Gacha')}: {new Date(tenant.planExpiresAt).toLocaleDateString(locale)}
                    </p>
                  )}
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="date"
                      value={tenantPlanExpires[tenant.id] || ''}
                      onChange={(e) => setTenantPlanExpires((prev) => ({ ...prev, [tenant.id]: e.target.value }))}
                      className="border rounded-lg px-3 py-2 text-sm"
                    />
                    <Button onClick={() => setTenantPlanExpires((prev) => ({ ...prev, [tenant.id]: '' }))} className="sg-btn ghost" style={{ fontSize: 11 }}>
                      {tr('\u0411\u0435\u0437 \u0441\u0440\u043e\u043a\u0430', 'Muddatsiz')}
                    </Button>
                    <Button onClick={() => void setPlan(tenant.id, 'FREE')} className="sg-btn ghost" style={{ fontSize: 12 }}>FREE</Button>
                    <Button onClick={() => void setPlan(tenant.id, 'PRO')} className="sg-btn ghost" style={{ fontSize: 12, color: '#5b21b6' }}>PRO</Button>
                    <Button onClick={() => void setPlan(tenant.id, 'BUSINESS')} className="sg-btn ghost" style={{ fontSize: 12, color: '#92400e' }}>BIZ</Button>
                  </div>
                </div>
              ))}
              {tenants.length === 0 && <p className="sg-subtitle">{tr('\u041d\u0435\u0442 \u0442\u0435\u043d\u0430\u043d\u0442\u043e\u0432', "Tenantlar yo'q")}</p>}
            </div>
          </article>

          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('\u041c\u0430\u0433\u0430\u0437\u0438\u043d\u044b', "Do'konlar")}</h3>
            <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
              {stores.map((store) => (
                <div key={store.id} className="sg-card soft" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700 }}>{store.name}</p>
                      <p style={{ margin: 0, fontSize: 12, color: '#738178' }}>{store.tenant?.name || '—'}</p>
                    </div>
                    <span
                      className="sg-badge"
                      style={{
                        background: store.isActive ? '#d1fae5' : '#f3f4f6',
                        color: store.isActive ? '#065f46' : '#4b5563',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <StatusDot ok={store.isActive} />
                      {store.isActive ? tr('\u0410\u043a\u0442\u0438\u0432\u0435\u043d', 'Faol') : tr('\u041e\u0442\u043a\u043b\u044e\u0447\u0435\u043d', "O'chirilgan")}
                    </span>
                  </div>
                </div>
              ))}
              {stores.length === 0 && <p className="sg-subtitle">{tr('\u041c\u0430\u0433\u0430\u0437\u0438\u043d\u044b \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b', "Do'konlar yo'q")}</p>}
            </div>
          </article>
        </div>

        {/* Report usage */}
        <section className="sg-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {tr('\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u043e\u0442\u0447\u0435\u0442\u043e\u0432 \u043f\u043e tenant', "Tenant bo'yicha hisobot eksporti")}
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={reportUsageMonth}
                onChange={(e) => setReportUsageMonth(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
                style={{ minWidth: 120 }}
                placeholder="YYYY-MM"
              />
              <Button onClick={() => void load()} className="sg-btn ghost">{tr('\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c', 'Yangilash')}</Button>
            </div>
          </div>

          <div className="sg-grid cols-4" style={{ marginTop: 10 }}>
            <div className="sg-card soft" style={{ padding: 10 }}>
              <div className="sg-kpi-label">{tr('\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u043e \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u043e\u0432', 'Eksport ishlatilgan')}</div>
              <div className="sg-kpi-value" style={{ fontSize: 22 }}>{reportUsageSummary?.totalExportsUsed ?? 0}</div>
            </div>
            <div className="sg-card soft" style={{ padding: 10 }}>
              <div className="sg-kpi-label">{tr('\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0432\u043a\u043b\u044e\u0447\u0435\u043d', 'Eksport yoqilgan')}</div>
              <div className="sg-kpi-value" style={{ fontSize: 22 }}>{reportUsageSummary?.tenantsWithExport ?? 0}</div>
            </div>
            <div className="sg-card soft" style={{ padding: 10 }}>
              <div className="sg-kpi-label">{tr('\u041d\u0430 \u043b\u0438\u043c\u0438\u0442\u0435', 'Limitga yetgan')}</div>
              <div className="sg-kpi-value" style={{ fontSize: 22, color: (reportUsageSummary?.blockedTenants ?? 0) > 0 ? '#dc2626' : undefined }}>
                {reportUsageSummary?.blockedTenants ?? 0}
              </div>
            </div>
          </div>

          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 280, overflow: 'auto' }}>
            {reportUsage.map((row) => (
              <div key={row.tenantId} className="sg-card soft" style={{ padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700 }}>{row.tenantName}</p>
                    <p style={{ margin: 0, color: '#738178', fontSize: 12 }}>{row.tenantSlug}</p>
                  </div>
                  <span className="sg-badge" style={planBadgeStyle(row.plan)}>{row.plan}</span>
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 13 }}>
                  <span style={{ color: '#526258' }}>
                    {tr('\u042d\u043a\u0441\u043f\u043e\u0440\u0442', 'Eksport')}: <strong>{row.exportsUsed}</strong> / {row.maxExportsPerMonth < 0 ? tr('\u0411\u0435\u0437\u043b\u0438\u043c\u0438\u0442', 'Cheksiz') : row.maxExportsPerMonth}
                  </span>
                  <span style={{ color: row.blockedByLimit ? '#b91c1c' : '#64756b', fontWeight: row.blockedByLimit ? 700 : 400 }}>
                    {tr('\u041e\u0441\u0442\u0430\u043b\u043e\u0441\u044c', 'Qoldi')}: {row.exportsLeft < 0 ? tr('\u0411\u0435\u0437\u043b\u0438\u043c\u0438\u0442', 'Cheksiz') : row.exportsLeft}
                    {row.blockedByLimit && <span style={{ marginLeft: 4 }}>⚠</span>}
                  </span>
                </div>
              </div>
            ))}
            {reportUsage.length === 0 && <p className="sg-subtitle">{tr('\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u043e \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0443', "Eksport bo'yicha ma'lumot yo'q")}</p>}
          </div>
        </section>

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64756b', fontSize: 13, padding: '0 4px' }}>
            <span className="sg-skeleton" style={{ width: 14, height: 14, borderRadius: '50%', minHeight: 14, flexShrink: 0 }} />
            {tr('\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435...', 'Yangilanmoqda...')}
          </div>
        )}
      </section>
    </>
  );
}
