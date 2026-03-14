import React, { useEffect, useMemo, useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../api/system-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

type InvoiceStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
type ActivityType = 'TENANT_PLAN_UPDATED' | 'INVOICE_CONFIRMED' | 'INVOICE_REJECTED';
type ActivityTarget = 'tenant' | 'invoice';
type NoticeTone = 'success' | 'error' | 'info';

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
  const [reportUsage, setReportUsage] = useState<any[]>([]);
  const [reportUsageSummary, setReportUsageSummary] = useState<any>(null);
  const [reportUsageMonth, setReportUsageMonth] = useState('');

  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | ''>('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  const [activityType, setActivityType] = useState<ActivityType | ''>('');
  const [activityTarget, setActivityTarget] = useState<ActivityTarget | ''>('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');
  const [tenantPlanExpires, setTenantPlanExpires] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDaysInput, setReminderDaysInput] = useState('7,3,1');
  const [reminderSaving, setReminderSaving] = useState(false);

  const statusLabel = useMemo(
    () => ({
      PENDING: tr('РћР¶РёРґР°РµС‚', 'Kutilmoqda'),
      PAID: tr('РћРїР»Р°С‡РµРЅ', "To'langan"),
      CANCELLED: tr('РћС‚РєР»РѕРЅРµРЅ', 'Rad etilgan'),
      EXPIRED: tr('РџСЂРѕСЃСЂРѕС‡РµРЅ', "Muddati o'tgan"),
    }),
    [tr]
  );

  const activityTypeLabel = useMemo(
    () => ({
      TENANT_PLAN_UPDATED: tr('РџР»Р°РЅ РѕР±РЅРѕРІР»РµРЅ', 'Tarif yangilandi'),
      INVOICE_CONFIRMED: tr('РРЅРІРѕР№СЃ РїРѕРґС‚РІРµСЂР¶РґРµРЅ', 'Invoice tasdiqlandi'),
      INVOICE_REJECTED: tr('РРЅРІРѕР№СЃ РѕС‚РєР»РѕРЅРµРЅ', 'Invoice rad etildi'),
    }),
    [tr]
  );

  const formatMoney = (value: number | string | null | undefined) => `${Number(value || 0).toLocaleString(locale)} UZS`;
  const toDateInput = (value?: string | null) => {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  };

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const pendingInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === 'PENDING'), [invoices]);
  const pendingInvoiceIds = useMemo(() => pendingInvoices.map((invoice) => invoice.id), [pendingInvoices]);
  const selectedPendingCount = useMemo(
    () => selectedInvoiceIds.filter((id) => pendingInvoiceIds.includes(id)).length,
    [selectedInvoiceIds, pendingInvoiceIds]
  );

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
      const [d, h, a, t, s, inv, ru] = await Promise.all([
        systemApi.dashboard(),
        systemApi.health(),
        systemApi.activity(activityQuery.toString()),
        systemApi.tenants('page=1&pageSize=50'),
        systemApi.stores('page=1&pageSize=50'),
        systemApi.invoices(invoiceQuery.toString()),
        systemApi.reportUsage(reportUsageQuery),
      ]);

      setDashboard(d);
      setHealth(h);
      setReminderEnabled(Boolean(h?.subscriptionReminders?.enabled));
      setReminderDaysInput(Array.isArray(h?.subscriptionReminders?.days) ? h.subscriptionReminders.days.join(',') : '7,3,1');
      setActivity(Array.isArray(a) ? a : []);
      const tenantItems = Array.isArray(t?.items) ? t.items : [];
      setTenants(tenantItems);
      setStores(Array.isArray(s?.items) ? s.items : []);
      setInvoices(Array.isArray(inv?.items) ? inv.items : []);
      setReportUsage(Array.isArray(ru?.items) ? ru.items : []);
      setReportUsageSummary(ru?.summary || null);
      if (!reportUsageMonth && ru?.monthKey) setReportUsageMonth(String(ru.monthKey));
      setSelectedInvoiceIds((prev) => prev.filter((id) => (Array.isArray(inv?.items) ? inv.items : []).some((x: any) => x.id === id)));
      setTenantPlanExpires(
        tenantItems.reduce((acc: Record<string, string>, tenant: any) => {
          acc[tenant.id] = toDateInput(tenant.planExpiresAt);
          return acc;
        }, {})
      );
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


  function parseReminderDaysInput(input: string): number[] {
    const parsed = input
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isInteger(x) && x >= 1 && x <= 30);
    return Array.from(new Set(parsed)).sort((a, b) => b - a);
  }

  async function saveReminderSettings() {
    const days = parseReminderDaysInput(reminderDaysInput);
    if (days.length === 0) {
      showNotice('error', tr('РЈРєР°Р¶РёС‚Рµ РґРЅРё С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ, РЅР°РїСЂРёРјРµСЂ: 7,3,1', 'Kunlarni vergul bilan kiriting, masalan: 7,3,1'));
      return;
    }

    setReminderSaving(true);
    try {
      const data = await systemApi.updateReminderSettings({ enabled: reminderEnabled, days });
      setReminderEnabled(Boolean(data?.enabled));
      setReminderDaysInput(Array.isArray(data?.days) ? data.days.join(',') : days.join(','));
      await load();
      showNotice('success', tr('РќР°СЃС‚СЂРѕР№РєРё РЅР°РїРѕРјРёРЅР°РЅРёР№ СЃРѕС…СЂР°РЅРµРЅС‹', 'Eslatma sozlamalari saqlandi'));
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to save reminder settings');
    } finally {
      setReminderSaving(false);
    }
  }
  async function setPlan(tenantId: string, plan: 'FREE' | 'PRO' | 'BUSINESS') {
    try {
      const expires = tenantPlanExpires[tenantId]?.trim();
      await systemApi.setTenantPlan(tenantId, plan, expires || undefined);
      await load();
      showNotice('success', tr('\u0422\u0430\u0440\u0438\u0444 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D', 'Tarif yangilandi'));
    } catch (err: any) {
      showNotice('error', err.message);
    }
  }

  async function moderateInvoice(id: string, action: 'confirm' | 'reject') {
    try {
      if (action === 'confirm') await systemApi.confirmInvoice(id);
      else await systemApi.rejectInvoice(id);
      await load();
      showNotice('success', action === 'confirm' ? tr('\u0421\u0447\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D', 'Invoice tasdiqlandi') : tr('\u0421\u0447\u0435\u0442 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D', 'Invoice rad etildi'));
    } catch (err: any) {
      showNotice('error', err.message);
    }
  }

  function toggleInvoiceSelection(invoiceId: string) {
    setSelectedInvoiceIds((prev) => (prev.includes(invoiceId) ? prev.filter((id) => id !== invoiceId) : [...prev, invoiceId]));
  }

  function toggleSelectAllPendingInvoices() {
    setSelectedInvoiceIds((prev) => {
      const allSelected = pendingInvoiceIds.length > 0 && pendingInvoiceIds.every((id) => prev.includes(id));
      if (allSelected) return prev.filter((id) => !pendingInvoiceIds.includes(id));
      const merged = new Set([...prev, ...pendingInvoiceIds]);
      return Array.from(merged);
    });
  }

  async function moderateSelectedInvoices(action: 'confirm' | 'reject') {
    const ids = selectedInvoiceIds.filter((id) => pendingInvoiceIds.includes(id));
    if (ids.length === 0) {
      showNotice('info', tr('\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0447\u0435\u0442\u0430 \u0441 \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u043C \u041E\u0436\u0438\u0434\u0430\u0435\u0442', "Avval 'Kutilmoqda' statusidagi invoicelarni tanlang"));
      return;
    }

    const results = await Promise.allSettled(
      ids.map((id) => (action === 'confirm' ? systemApi.confirmInvoice(id) : systemApi.rejectInvoice(id)))
    );
    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failedCount = results.length - successCount;
    setSelectedInvoiceIds((prev) => prev.filter((id) => !ids.includes(id)));
    await load();

    if (failedCount === 0) {
      showNotice(
        'success',
        action === 'confirm'
          ? tr('\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E: ' + successCount, 'Tasdiqlandi: ' + successCount)
          : tr('\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u043E: ' + successCount, 'Rad etildi: ' + successCount)
      );
      return;
    }

    showNotice(
      'error',
      action === 'confirm'
        ? tr('\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E: ' + successCount + ', \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439: ' + failedCount, 'Tasdiqlandi: ' + successCount + ', xato: ' + failedCount)
        : tr('\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u043E: ' + successCount + ', \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439: ' + failedCount, 'Rad etildi: ' + successCount + ', xato: ' + failedCount)
    );
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
        padding: '10px 12px',
        color: notice.tone === 'error' ? '#991b1b' : notice.tone === 'success' ? '#065f46' : '#1e3a8a',
        background: notice.tone === 'error' ? '#fee2e2' : notice.tone === 'success' ? '#d1fae5' : '#dbeafe',
        border: `1px solid ${notice.tone === 'error' ? '#fecaca' : notice.tone === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
        fontSize: 13,
        fontWeight: 700,
        boxShadow: '0 10px 24px rgba(0,0,0,0.08)',
      }}
    >
      {notice.message}
    </div>
  ) : null;

  if (!loggedIn) {
    return (
      <>
        {noticeNode}
      <section className="sg-page" style={{ maxWidth: 460, margin: '20px auto' }}>
        <h2 className="sg-title" style={{ fontSize: 28 }}>{tr('Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ Р°РґРјРёРЅ СЃРёСЃС‚РµРјС‹', 'Global tizim admini')}</h2>
        <p className="sg-subtitle">{tr('РћС‚РґРµР»СЊРЅР°СЏ РєРѕРЅСЃРѕР»СЊ РґР»СЏ РєРѕРЅС‚СЂРѕР»СЏ РїР»Р°С‚С„РѕСЂРјС‹ Рё РјРѕРґРµСЂР°С†РёРё РѕРїР»Р°С‚.', 'Platforma nazorati va to\'lov moderatsiyasi uchun alohida konsol.')}</p>

        <div className="sg-grid" style={{ marginTop: 14 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr('РџР°СЂРѕР»СЊ', 'Parol')} className="w-full border rounded-lg px-3 py-2 text-sm" />
          {loginError && <p style={{ color: '#b91c1c', fontSize: 13 }}>{loginError}</p>}
          <button onClick={login} disabled={loading} className="sg-btn primary" style={{ width: '100%' }}>
            {loading ? tr('Р’С…РѕРґРёРј...', 'Kirilmoqda...') : tr('Р’РѕР№С‚Рё', 'Kirish')}
          </button>
        </div>
      </section>
      </>
    );
  }

  return (
    <>
      {noticeNode}
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
        <div>
          <h2 className="sg-title">{tr('РљРѕРЅСЃРѕР»СЊ СЃРёСЃС‚РµРјРЅРѕРіРѕ Р°РґРјРёРЅР°', 'Tizim admin konsoli')}</h2>
          <p className="sg-subtitle">{tr('РћРїРµСЂР°С†РёРё, РјРѕРґРµСЂР°С†РёСЏ billing Рё РєРѕРЅС‚СЂРѕР»СЊ РїР»Р°С‚С„РѕСЂРјС‹.', 'Operatsiyalar, billing moderatsiyasi va platforma nazorati.')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={goToStoreAdmin} className="sg-btn ghost">
            {tr('РџР°РЅРµР»СЊ РјР°РіР°Р·РёРЅР°', "Do'kon paneli")}
          </Button>
          <Button onClick={logout} className="sg-btn danger">
            {tr('Р’С‹Р№С‚Рё', 'Chiqish')}
          </Button>
        </div>
      </header>

      <div className="sg-grid cols-4">
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('РўРµРЅР°РЅС‚С‹', 'Tenantlar')}</div>
          <div className="sg-kpi-value">{dashboard?.tenants ?? '-'}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('РђРєС‚РёРІРЅС‹Рµ РјР°РіР°Р·РёРЅС‹', "Faol do'konlar")}</div>
          <div className="sg-kpi-value">{dashboard?.activeStores ?? '-'}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('РЎС‡РµС‚Р° РЅР° РјРѕРґРµСЂР°С†РёРё', 'Moderatsiyadagi invoice')}</div>
          <div className="sg-kpi-value">{dashboard?.pendingInvoices ?? '-'}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('РЎСѓРјРјР° РѕР¶РёРґР°РЅРёСЏ', 'Kutilayotgan summa')}</div>
          <div className="sg-kpi-value">{formatMoney(dashboard?.pendingAmount)}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('РћРїР»Р°С‡РµРЅРѕ (РјРµСЃСЏС†)', "To'langan (oy)")}</div>
          <div className="sg-kpi-value">{dashboard?.paidInvoicesMonth ?? '-'}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Р’С‹СЂСѓС‡РєР° РїРѕ СЃС‡РµС‚Р°Рј (РјРµСЃСЏС†)', "Invoice tushumi (oy)")}</div>
          <div className="sg-kpi-value">{formatMoney(dashboard?.paidRevenueMonth)}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Р—Р°РєР°Р·С‹ Р·Р° РјРµСЃСЏС†', 'Oylik buyurtmalar')}</div>
          <div className="sg-kpi-value">{dashboard?.monthlyOrders ?? '-'}</div>
        </article>
      </div>

      <section className="sg-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('РЎРѕСЃС‚РѕСЏРЅРёРµ СЃРёСЃС‚РµРјС‹', 'Tizim holati')}</h3>
          <span className="sg-badge" style={{ background: health?.status === 'ok' ? '#e8f7ef' : '#fff1f2', color: health?.status === 'ok' ? '#0f7a4f' : '#be123c' }}>
            {health?.status === 'ok' ? tr('РЎС‚Р°Р±РёР»СЊРЅРѕ', "Sog'lom") : tr('Р•СЃС‚СЊ РґРµРіСЂР°РґР°С†РёСЏ', 'Nosoz')}
          </span>
        </div>
        <div className="sg-grid cols-4" style={{ marginTop: 10 }}>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">DB</div>
            <div style={{ fontWeight: 800 }}>{health?.db?.ok ? tr('РџРѕРґРєР»СЋС‡РµРЅР°', 'Ulangan') : tr('РќРµРґРѕСЃС‚СѓРїРЅР°', 'Mavjud emas')}</div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">DB ms</div>
            <div style={{ fontWeight: 800 }}>{health?.db?.latencyMs ?? '-'}</div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">{tr('РђРїС‚Р°Р№Рј', 'Ish vaqti')}</div>
            <div style={{ fontWeight: 800 }}>{health?.runtime?.uptimeSec ?? '-'}s</div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">{tr('РџР°РјСЏС‚СЊ', 'Xotira')}</div>
            <div style={{ fontWeight: 800 }}>{health?.runtime?.memoryMb ?? '-'} MB</div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">{tr('\u041d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u044f \u043e \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0435', 'Obuna eslatmalari')}</div>
            <div style={{ fontWeight: 800 }}>
              {health?.subscriptionReminders?.enabled ? tr('\u0412\u043a\u043b\u044e\u0447\u0435\u043d\u044b', 'Yoqilgan') : tr('\u0412\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u044b', "O'chirilgan")}
            </div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">{tr('\u0414\u043d\u0438 \u0434\u043e \u043e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u044f', 'Tugashgacha kunlar')}</div>
            <div style={{ fontWeight: 800 }}>
              {Array.isArray(health?.subscriptionReminders?.days) && health.subscriptionReminders.days.length > 0
                ? health.subscriptionReminders.days.join(', ')
                : '-'}
            </div>
          </div>
          <div className="sg-card soft" style={{ padding: 12, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />
                {tr('Р’РєР»СЋС‡РёС‚СЊ РЅР°РїРѕРјРёРЅР°РЅРёСЏ', 'Eslatmalarni yoqish')}
              </label>
              <input
                value={reminderDaysInput}
                onChange={(e) => setReminderDaysInput(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
                style={{ minWidth: 220 }}
                placeholder="7,3,1"
              />
              <Button onClick={() => void saveReminderSettings()} className="sg-btn primary" disabled={reminderSaving}>
                {reminderSaving ? tr('РЎРѕС…СЂР°РЅСЏРµРј...', 'Saqlanmoqda...') : tr('РЎРѕС…СЂР°РЅРёС‚СЊ', 'Saqlash')}
              </Button>
            </div>
            <p className="sg-subtitle" style={{ marginTop: 8 }}>
              {tr('Р”РЅРё С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ, 1..30', 'Kunlar vergul bilan, 1..30')}
            </p>
          </div>
        </div>
      </section>

      <div className="sg-grid cols-2">
        <article className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('РњРѕРґРµСЂР°С†РёСЏ СЃС‡РµС‚РѕРІ', 'Invoice moderatsiyasi')}</h3>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <select
              value={invoiceStatus}
              onChange={(e) => setInvoiceStatus(e.target.value as InvoiceStatus | '')}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{tr('Р’СЃРµ СЃС‚Р°С‚СѓСЃС‹', 'Barcha statuslar')}</option>
              <option value="PENDING">{statusLabel.PENDING}</option>
              <option value="PAID">{statusLabel.PAID}</option>
              <option value="CANCELLED">{statusLabel.CANCELLED}</option>
              <option value="EXPIRED">{statusLabel.EXPIRED}</option>
            </select>
            <input
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              placeholder={tr('РџРѕРёСЃРє tenant / payment ref', 'Tenant / payment ref qidirish')}
              className="border rounded-lg px-3 py-2 text-sm"
              style={{ minWidth: 240 }}
            />
            <Button onClick={() => void load()} className="sg-btn ghost">{tr('РџСЂРёРјРµРЅРёС‚СЊ', "Qo'llash")}</Button>
            <Button onClick={toggleSelectAllPendingInvoices} className="sg-btn ghost">
              {pendingInvoiceIds.length > 0 && pendingInvoiceIds.every((id) => selectedInvoiceIds.includes(id))
                ? tr('\u0421\u043D\u044F\u0442\u044C \u0432\u044B\u0431\u043E\u0440 pending', 'Pending tanlovini bekor qilish')
                : tr('\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u0435 pending', 'Barcha pendingni tanlash')}
            </Button>
            <Button onClick={() => void moderateSelectedInvoices('confirm')} className="sg-btn primary">
              {tr('\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435', 'Tanlanganlarni tasdiqlash')} ({selectedPendingCount})
            </Button>
            <Button onClick={() => void moderateSelectedInvoices('reject')} className="sg-btn danger">
              {tr('\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435', 'Tanlanganlarni rad etish')} ({selectedPendingCount})
            </Button>
          </div>

          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
            {invoices.map((invoice) => (
              <div key={invoice.id} className="sg-card soft" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedInvoiceIds.includes(invoice.id)}
                      onChange={() => toggleInvoiceSelection(invoice.id)}
                    />
                    <p style={{ margin: 0, fontWeight: 700 }}>{invoice.tenant?.name || invoice.tenantId}</p>
                  </div>
                  <span className="sg-badge" style={{ background: '#f3f4f6', color: '#374151' }}>{statusLabel[invoice.status as InvoiceStatus] || invoice.status}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{formatMoney(invoice.amount)}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#738178' }}>
                  {tr('РўР°СЂРёС„', 'Tarif')}: {invoice.plan}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#738178' }}>{invoice.paymentRef || tr('Payment ref РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚', "Payment ref yo'q")}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#738178' }}>{new Date(invoice.createdAt).toLocaleString(locale)}</p>
                {invoice.status === 'PENDING' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <Button onClick={() => moderateInvoice(invoice.id, 'confirm')} className="sg-btn primary">
                      {tr('РџРѕРґС‚РІРµСЂРґРёС‚СЊ', 'Tasdiqlash')}
                    </Button>
                    <Button onClick={() => moderateInvoice(invoice.id, 'reject')} className="sg-btn danger">
                      {tr('РћС‚РєР»РѕРЅРёС‚СЊ', 'Rad etish')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {invoices.length === 0 && <p className="sg-subtitle">{tr('РЎС‡РµС‚Р° РЅРµ РЅР°Р№РґРµРЅС‹', 'Invoice topilmadi')}</p>}
          </div>
        </article>

        <article className="sg-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Р–СѓСЂРЅР°Р» РґРµР№СЃС‚РІРёР№', 'Harakatlar jurnali')}</h3>
            <Button onClick={exportActivityCsv} className="sg-btn ghost">CSV</Button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <select value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityType | '')} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">{tr('Р’СЃРµ РґРµР№СЃС‚РІРёСЏ', 'Barcha harakatlar')}</option>
              <option value="TENANT_PLAN_UPDATED">{activityTypeLabel.TENANT_PLAN_UPDATED}</option>
              <option value="INVOICE_CONFIRMED">{activityTypeLabel.INVOICE_CONFIRMED}</option>
              <option value="INVOICE_REJECTED">{activityTypeLabel.INVOICE_REJECTED}</option>
            </select>
            <select value={activityTarget} onChange={(e) => setActivityTarget(e.target.value as ActivityTarget | '')} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">{tr('Р’СЃРµ РѕР±СЉРµРєС‚С‹', 'Barcha obyektlar')}</option>
              <option value="tenant">{tr('РўРµРЅР°РЅС‚С‹', 'Tenantlar')}</option>
              <option value="invoice">{tr('РЎС‡РµС‚Р°', 'Invoicelar')}</option>
            </select>
            <input value={activitySearch} onChange={(e) => setActivitySearch(e.target.value)} placeholder={tr('РџРѕРёСЃРє РїРѕ actor/target', 'Ijrochi/obyekt qidirish')} className="border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={activityDateFrom} onChange={(e) => setActivityDateFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={activityDateTo} onChange={(e) => setActivityDateTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            <Button onClick={() => void load()} className="sg-btn ghost">{tr('РџСЂРёРјРµРЅРёС‚СЊ', "Qo'llash")}</Button>
          </div>

          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
            {activity.map((item) => (
              <div key={item.id} className="sg-card soft" style={{ padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{activityTypeLabel[item.type as ActivityType] || item.message}</strong>
                  <span style={{ fontSize: 12, color: '#64756b' }}>{new Date(item.at).toLocaleString(locale)}</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64756b' }}>{item.context?.tenantName || item.context?.tenantId || '-'}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64756b' }}>{tr('РљС‚Рѕ', 'Ijrochi')}: {item.actor || tr('СЃРёСЃС‚РµРјР°', 'tizim')}</p>
              </div>
            ))}
            {activity.length === 0 && <p className="sg-subtitle">{tr('РџРѕРєР° РЅРµС‚ РґРµР№СЃС‚РІРёР№', "Hali harakatlar yo'q")}</p>}
          </div>
        </article>
      </div>

      <div className="sg-grid cols-2">
        <article className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('РўРµРЅР°РЅС‚С‹', 'Tenantlar')}</h3>
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
                  <input
                    type="date"
                    value={tenantPlanExpires[tenant.id] || ''}
                    onChange={(e) => setTenantPlanExpires((prev) => ({ ...prev, [tenant.id]: e.target.value }))}
                    className="border rounded-lg px-3 py-2 text-sm"
                    title={tr('\u0414\u0430\u0442\u0430 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F \u0442\u0430\u0440\u0438\u0444\u0430', 'Tarif tugash sanasi')}
                  />
                  <Button onClick={() => setTenantPlanExpires((prev) => ({ ...prev, [tenant.id]: '' }))} className="sg-btn ghost">
                    {tr('\u0411\u0435\u0437 \u0441\u0440\u043E\u043A\u0430', 'Muddatsiz')}
                  </Button>
                  <Button onClick={() => setPlan(tenant.id, 'FREE')} className="sg-btn ghost">FREE</Button>
                  <Button onClick={() => setPlan(tenant.id, 'PRO')} className="sg-btn ghost">PRO</Button>
                  <Button onClick={() => setPlan(tenant.id, 'BUSINESS')} className="sg-btn ghost">BUSINESS</Button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('РњР°РіР°Р·РёРЅС‹', "Do'konlar")}</h3>
          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
            {stores.map((store) => (
              <div key={store.id} className="sg-card soft" style={{ padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{store.name}</p>
                  <span className="sg-badge" style={{ background: store.isActive ? '#e8f7ef' : '#f3f4f6', color: store.isActive ? '#0f7a4f' : '#4b5563' }}>
                    {store.isActive ? tr('РђРєС‚РёРІРµРЅ', 'Faol') : tr('Р’С‹РєР»СЋС‡РµРЅ', "O'chirilgan")}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#738178' }}>{store.tenant?.name || '-'}</p>
              </div>
            ))}
          </div>
        </article>
      </div>

      <section className="sg-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Report exports by tenant', "Tenantlar bo'yicha hisobot eksporti")}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={reportUsageMonth}
              onChange={(e) => setReportUsageMonth(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
              style={{ minWidth: 120 }}
              placeholder="YYYY-MM"
            />
            <Button onClick={() => void load()} className="sg-btn ghost">{tr('Refresh', 'Yangilash')}</Button>
          </div>
        </div>

        <div className="sg-grid cols-4" style={{ marginTop: 10 }}>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">{tr('Exports used', 'Ishlatilgan eksport')}</div>
            <div style={{ fontWeight: 800 }}>{reportUsageSummary?.totalExportsUsed ?? 0}</div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">{tr('Export enabled', 'Eksport yoqilgan')}</div>
            <div style={{ fontWeight: 800 }}>{reportUsageSummary?.tenantsWithExport ?? 0}</div>
          </div>
          <div className="sg-card soft" style={{ padding: 10 }}>
            <div className="sg-kpi-label">{tr('At limit', 'Limitga yetganlar')}</div>
            <div style={{ fontWeight: 800 }}>{reportUsageSummary?.blockedTenants ?? 0}</div>
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
                <span className="sg-badge" style={{ background: '#eef2ff', color: '#3730a3' }}>{row.plan}</span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#526258' }}>
                {tr('Export', 'Eksport')}: {row.exportsUsed} / {row.maxExportsPerMonth < 0 ? tr('Unlimited', 'Cheksiz') : row.maxExportsPerMonth}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: row.blockedByLimit ? '#b91c1c' : '#64756b' }}>
                {tr('Left', 'Qoldi')}: {row.exportsLeft < 0 ? tr('Unlimited', 'Cheksiz') : row.exportsLeft}
              </p>
            </div>
          ))}
          {reportUsage.length === 0 && <p className="sg-subtitle">{tr('No export data', "Eksport bo'yicha ma'lumot yo'q")}</p>}
        </div>
      </section>

      {loading && <p className="sg-subtitle">{tr('Refreshing...', 'Yangilanmoqda...')}</p>}
    </section>
    </>
  );
}



