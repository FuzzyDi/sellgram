import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../api/system-admin-client';
import { setTokens } from '../api/store-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

type InvoiceStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
type ActivityType = 'TENANT_PLAN_UPDATED' | 'INVOICE_CONFIRMED' | 'INVOICE_REJECTED';
type ActivityTarget = 'tenant' | 'invoice';
type NoticeTone = 'success' | 'error' | 'info';
type Tab = 'overview' | 'invoices' | 'tenants' | 'users' | 'reports' | 'activity';

/* ── helpers ─────────────────────────────────────────────── */

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? '#00b96b' : '#ef4444', marginRight: 6, flexShrink: 0,
      boxShadow: ok ? '0 0 0 2px rgba(0,185,107,0.2)' : '0 0 0 2px rgba(239,68,68,0.2)',
    }} />
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

function formatUptime(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}д`);
  if (h > 0) parts.push(`${h}ч`);
  parts.push(`${m}м`);
  return parts.join(' ');
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function Skeleton({ w, h, r = 8 }: { w?: string | number; h: number; r?: number }) {
  return <div className="sg-skeleton" style={{ width: w ?? '100%', height: h, borderRadius: r, minHeight: h }} />;
}

function exportCsv(filename: string, rows: string[][], headers: string[]) {
  const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Revenue bar chart ────────────────────────────────────── */
function RevenueChart({ data }: { data: { label: string; revenue: number }[] }) {
  const max = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100, padding: '0 4px' }}>
      {data.map(({ label, revenue }) => {
        const pct = revenue / max;
        const month = label.slice(5);
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>
              {revenue > 0 ? `${(revenue / 1_000_000).toFixed(1)}M` : ''}
            </span>
            <div
              title={`${label}: ${revenue.toLocaleString()} UZS`}
              style={{
                width: '100%', borderRadius: '4px 4px 0 0',
                height: `${Math.max(pct * 72, revenue > 0 ? 4 : 0)}px`,
                background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                transition: 'height 0.3s ease',
              }}
            />
            <span style={{ fontSize: 10, color: '#6b7280' }}>{month}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Tenant detail drawer ─────────────────────────────────── */
function TenantDrawer({
  tenant, onClose, locale, tr, onBlock, onUnblock, onImpersonate,
}: {
  tenant: any; onClose: () => void; locale: string;
  tr: (ru: string, uz: string) => string;
  onBlock: () => Promise<void>; onUnblock: () => Promise<void>; onImpersonate: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    systemApi.tenantDetail(tenant.id)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenant.id]);

  const isBlocked = detail?.stores?.every((s: any) => !s.isActive) ?? false;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.3)', cursor: 'pointer' }} />
      <div style={{
        width: Math.min(520, window.innerWidth), background: '#fff', height: '100vh',
        overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', animation: 'sg-fade-in 0.15s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tenant.name}</h2>
            <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>{tenant.slug}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af', padding: 4 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="sg-badge" style={planBadgeStyle(tenant.plan)}>{tenant.plan}</span>
          {tenant.planExpiresAt && (
            <span className="sg-badge" style={{ background: '#f3f4f6', color: '#374151' }}>
              {tr('До', 'Gacha')} {new Date(tenant.planExpiresAt).toLocaleDateString(locale)}
            </span>
          )}
        </div>

        {loading && (
          <div className="sg-grid" style={{ gap: 10 }}>
            {[1,2,3,4].map(i => <Skeleton key={i} h={70} r={10} />)}
          </div>
        )}

        {detail && !loading && (
          <>
            {/* Stats */}
            <div className="sg-grid cols-2" style={{ gap: 10 }}>
              {[
                { label: tr('Заказов всего', 'Jami buyurtmalar'), value: detail.stats.ordersTotal },
                { label: tr('Заказов за месяц', 'Oylik buyurtmalar'), value: detail.stats.ordersMonth },
                { label: tr('Товаров', 'Mahsulotlar'), value: detail.stats.productsTotal },
                { label: tr('Клиентов', 'Mijozlar'), value: detail.stats.customersTotal },
                { label: tr('Выручка всего', "Jami tushum"), value: `${detail.stats.revenueTotal.toLocaleString(locale)} UZS` },
                { label: tr('Выручка за месяц', 'Oylik tushum'), value: `${detail.stats.revenueMonth.toLocaleString(locale)} UZS` },
              ].map(({ label, value }) => (
                <div key={label} className="sg-card soft" style={{ padding: 10 }}>
                  <div className="sg-kpi-label">{label}</div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Stores */}
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#374151' }}>{tr('Магазины', "Do'konlar")}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detail.stores.map((s: any) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#f9fafb' }}>
                    <StatusDot ok={s.isActive} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                      {s.isActive ? tr('Активен', 'Faol') : tr('Откл.', "O'ch.")}
                    </span>
                  </div>
                ))}
                {detail.stores.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>{tr('Нет магазинов', "Do'konlar yo'q")}</p>}
              </div>
            </div>

            {/* Users */}
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#374151' }}>{tr('Пользователи', 'Foydalanuvchilar')}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detail.users.map((u: any) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#f9fafb' }}>
                    <StatusDot ok={u.isActive} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{u.email}</div>
                    </div>
                    <span className="sg-badge" style={{ marginLeft: 'auto', background: '#f3f4f6', color: '#374151', fontSize: 11 }}>{u.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
          <Button
            className={isBlocked ? 'sg-btn primary' : 'sg-btn danger'}
            disabled={blocking}
            onClick={async () => {
              setBlocking(true);
              if (isBlocked) await onUnblock(); else await onBlock();
              setBlocking(false);
              onClose();
            }}
          >
            {blocking ? '...' : isBlocked ? tr('Разблокировать', 'Blokdan chiqarish') : tr('Заблокировать', 'Bloklash')}
          </Button>
          <Button
            className="sg-btn ghost"
            disabled={impersonating}
            onClick={async () => {
              setImpersonating(true);
              await onImpersonate();
              setImpersonating(false);
            }}
          >
            {impersonating ? '...' : tr('Войти как', 'Sifatida kirish')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SystemAdmin() {
  const { tr, locale, lang, setLang } = useAdminI18n();

  const [loggedIn, setLoggedIn] = useState(!!sessionStorage.getItem('systemToken'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  const [dashboard, setDashboard] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [revenueTrend, setRevenueTrend] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantTotal, setTenantTotal] = useState(0);
  const [tenantPage, setTenantPage] = useState(1);
  const [stores, setStores] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoicePage, setInvoicePage] = useState(1);
  const [reportUsage, setReportUsage] = useState<any[]>([]);
  const [reportUsageSummary, setReportUsageSummary] = useState<any>(null);
  const [reportUsageMonth, setReportUsageMonth] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);

  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | ''>('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [activityType, setActivityType] = useState<ActivityType | ''>('');
  const [activityTarget, setActivityTarget] = useState<ActivityTarget | ''>('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');

  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [tenantPlanExpires, setTenantPlanExpires] = useState<Record<string, string>>({});
  const [planConfirm, setPlanConfirm] = useState<{ tenantId: string; plan: string } | null>(null);
  const planConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDaysInput, setReminderDaysInput] = useState('7,3,1');
  const [reminderSaving, setReminderSaving] = useState(false);

  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);

  // Invoice creation form
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ tenantId: '', plan: 'PRO', amount: '', paymentRef: '', autoConfirm: false });
  const [invoiceFormSaving, setInvoiceFormSaving] = useState(false);

  const PAGE_SIZE = 25;

  const statusLabel = useMemo(() => ({
    PENDING: tr('Ожидает', 'Kutilmoqda'),
    PAID: tr('Оплачен', "To'langan"),
    CANCELLED: tr('Отклонён', 'Rad etilgan'),
    EXPIRED: tr('Просрочен', "Muddati o'tgan"),
  }), [tr]);

  const activityTypeLabel = useMemo(() => ({
    TENANT_PLAN_UPDATED: tr('Тариф обновлён', 'Tarif yangilandi'),
    INVOICE_CONFIRMED: tr('Инвойс подтверждён', 'Invoice tasdiqlandi'),
    INVOICE_REJECTED: tr('Инвойс отклонён', 'Invoice rad etildi'),
  }), [tr]);

  const formatMoney = (value: number | string | null | undefined) =>
    `${Number(value || 0).toLocaleString(locale)} UZS`;

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  function parseReminderDays(input: string): number[] {
    const parsed = input.split(',').map(x => Number(x.trim()))
      .filter(x => Number.isInteger(x) && x >= 1 && x <= 30);
    return Array.from(new Set(parsed)).sort((a, b) => b - a);
  }

  async function load(silent = false, opts: { invoicePg?: number; tenantPg?: number; userPg?: number } = {}) {
    const iPg = opts.invoicePg ?? invoicePage;
    const tPg = opts.tenantPg ?? tenantPage;
    const uPg = opts.userPg ?? userPage;

    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const invoiceQuery = new URLSearchParams({ page: String(iPg), pageSize: String(PAGE_SIZE) });
      if (invoiceStatus) invoiceQuery.set('status', invoiceStatus);
      if (invoiceSearch.trim()) invoiceQuery.set('search', invoiceSearch.trim());

      const activityQuery = new URLSearchParams({ limit: '200' });
      if (activityType) activityQuery.set('action', activityType);
      if (activityTarget) activityQuery.set('targetType', activityTarget);
      if (activitySearch.trim()) activityQuery.set('search', activitySearch.trim());
      if (activityDateFrom) activityQuery.set('dateFrom', new Date(activityDateFrom).toISOString());
      if (activityDateTo) {
        const end = new Date(activityDateTo);
        end.setHours(23, 59, 59, 999);
        activityQuery.set('dateTo', end.toISOString());
      }

      const reportUsageQuery = `page=1&pageSize=50${reportUsageMonth ? '&month=' + encodeURIComponent(reportUsageMonth) : ''}`;
      const usersQuery = `page=${uPg}&pageSize=${PAGE_SIZE}${userSearch.trim() ? '&search=' + encodeURIComponent(userSearch.trim()) : ''}`;
      const tenantsQuery = `page=${tPg}&pageSize=${PAGE_SIZE}${tenantSearch.trim() ? '&search=' + encodeURIComponent(tenantSearch.trim()) : ''}`;

      const [d, h, trend, a, t, s, inv, ru, us] = await Promise.all([
        systemApi.dashboard(),
        systemApi.health(),
        systemApi.revenueTrend(),
        systemApi.activity(activityQuery.toString()),
        systemApi.tenants(tenantsQuery),
        systemApi.stores('page=1&pageSize=50'),
        systemApi.invoices(invoiceQuery.toString()),
        systemApi.reportUsage(reportUsageQuery),
        systemApi.users(usersQuery),
      ]);

      setDashboard(d);
      setHealth(h);
      setRevenueTrend(Array.isArray(trend) ? trend : []);
      setReminderEnabled(Boolean(h?.subscriptionReminders?.enabled));
      setReminderDaysInput(Array.isArray(h?.subscriptionReminders?.days) ? h.subscriptionReminders.days.join(',') : '7,3,1');
      setActivity(Array.isArray(a) ? a : []);

      const tenantItems = Array.isArray(t?.items) ? t.items : [];
      setTenants(tenantItems);
      setTenantTotal(t?.total ?? 0);
      setTenantPlanExpires(
        tenantItems.reduce((acc: Record<string, string>, tenant: any) => {
          acc[tenant.id] = toDateInput(tenant.planExpiresAt);
          return acc;
        }, {})
      );

      setStores(Array.isArray(s?.items) ? s.items : []);
      setInvoices(Array.isArray(inv?.items) ? inv.items : []);
      setInvoiceTotal(inv?.total ?? 0);
      setReportUsage(Array.isArray(ru?.items) ? ru.items : []);
      setReportUsageSummary(ru?.summary || null);
      setUsers(Array.isArray(us?.items) ? us.items : []);
      setUserTotal(us?.total ?? 0);
      if (!reportUsageMonth && ru?.monthKey) setReportUsageMonth(String(ru.monthKey));
    } catch (err: any) {
      clearSystemToken();
      setLoggedIn(false);
      setLoginError(err?.message || 'System session expired');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setInitialLoad(false);
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
      setLoginError(err?.message || tr('Ошибка входа', 'Kirish xatosi'));
    } finally {
      setLoading(false);
    }
  }

  function logout() { clearSystemToken(); setLoggedIn(false); }
  function goToStoreAdmin() { clearSystemToken(); window.location.hash = '/'; }

  async function saveReminderSettings() {
    const days = parseReminderDays(reminderDaysInput);
    if (days.length === 0) {
      showNotice('error', tr('Укажите дни через запятую, например: 7,3,1', 'Kunlarni vergul bilan kiriting: 7,3,1'));
      return;
    }
    setReminderSaving(true);
    try {
      const data = await systemApi.updateReminderSettings({ enabled: reminderEnabled, days });
      setReminderEnabled(Boolean(data?.enabled));
      setReminderDaysInput(Array.isArray(data?.days) ? data.days.join(',') : days.join(','));
      showNotice('success', tr('Настройки напоминаний сохранены', 'Eslatma sozlamalari saqlandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setReminderSaving(false);
    }
  }

  function requestPlanChange(tenantId: string, plan: string) {
    if (planConfirm?.tenantId === tenantId && planConfirm?.plan === plan) {
      if (planConfirmTimer.current) clearTimeout(planConfirmTimer.current);
      setPlanConfirm(null);
      void setPlan(tenantId, plan as 'FREE' | 'PRO' | 'BUSINESS');
    } else {
      setPlanConfirm({ tenantId, plan });
      if (planConfirmTimer.current) clearTimeout(planConfirmTimer.current);
      planConfirmTimer.current = setTimeout(() => setPlanConfirm(null), 3000);
    }
  }

  async function setPlan(tenantId: string, plan: 'FREE' | 'PRO' | 'BUSINESS') {
    try {
      const expires = tenantPlanExpires[tenantId]?.trim();
      await systemApi.setTenantPlan(tenantId, plan, expires || undefined);
      await load(true);
      showNotice('success', tr('Тариф обновлён', 'Tarif yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function moderateInvoice(id: string, action: 'confirm' | 'reject') {
    try {
      if (action === 'confirm') await systemApi.confirmInvoice(id);
      else await systemApi.rejectInvoice(id);
      await load(true);
      showNotice('success', action === 'confirm'
        ? tr('Инвойс подтверждён', 'Invoice tasdiqlandi')
        : tr('Инвойс отклонён', 'Invoice rad etildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function resetUserPassword(userId: string, userEmail: string) {
    const newPassword = (resetPasswords[userId] || '').trim();
    if (newPassword.length < 6) {
      showNotice('error', tr('Пароль должен быть минимум 6 символов', "Parol kamida 6 belgidan iborat bo'lsin"));
      return;
    }
    try {
      await systemApi.resetUserPassword(userId, newPassword);
      setResetPasswords(prev => ({ ...prev, [userId]: '' }));
      showNotice('success', tr(`Пароль обновлён: ${userEmail}`, `${userEmail} uchun parol yangilandi`));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сброса пароля', 'Parolni tiklashda xato'));
    }
  }

  async function handleImpersonate(tenantId: string) {
    try {
      const data = await systemApi.impersonate(tenantId);
      clearSystemToken();
      setTokens(data.accessToken, data.refreshToken);
      window.location.hash = '/';
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка входа как тенант', 'Tenant sifatida kirishda xato'));
    }
  }

  async function submitInvoiceForm() {
    const amount = parseInt(invoiceForm.amount, 10);
    if (!invoiceForm.tenantId) return showNotice('error', tr('Выберите тенанта', 'Tenantni tanlang'));
    if (!amount || amount < 1) return showNotice('error', tr('Укажите сумму', 'Summani kiriting'));
    setInvoiceFormSaving(true);
    try {
      await systemApi.createInvoice({
        tenantId: invoiceForm.tenantId,
        plan: invoiceForm.plan as any,
        amount,
        paymentRef: invoiceForm.paymentRef.trim() || undefined,
        autoConfirm: invoiceForm.autoConfirm,
      });
      setShowInvoiceForm(false);
      setInvoiceForm({ tenantId: '', plan: 'PRO', amount: '', paymentRef: '', autoConfirm: false });
      await load(true);
      showNotice('success', tr('Инвойс создан', 'Invoice yaratildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setInvoiceFormSaving(false);
    }
  }

  const pendingInvoices = invoices.filter(i => i.status === 'PENDING').length;

  /* ── toast ─────────────────────────────────────────────── */

  const noticeNode = notice ? (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 9999,
      minWidth: 260, maxWidth: 420, borderRadius: 12, padding: '12px 16px',
      color: notice.tone === 'error' ? '#991b1b' : notice.tone === 'success' ? '#065f46' : '#1e3a8a',
      background: notice.tone === 'error' ? '#fee2e2' : notice.tone === 'success' ? '#d1fae5' : '#dbeafe',
      border: `1px solid ${notice.tone === 'error' ? '#fecaca' : notice.tone === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
      fontSize: 13, fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      animation: 'sg-fade-in 0.2s ease both',
    }}>
      {notice.message}
    </div>
  ) : null;

  /* ── login ─────────────────────────────────────────────── */

  if (!loggedIn) {
    return (
      <>
        {noticeNode}
        <section className="sg-page" style={{ maxWidth: 460, margin: '40px auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14, gap: 6 }}>
            {(['ru', 'uz'] as const).map(l => (
              <button key={l} type="button" onClick={() => setLang(l)} className="sg-btn ghost"
                style={{ fontWeight: 800, fontSize: 12, padding: '4px 12px', ...(lang === l ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : {}) }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <h2 className="sg-title" style={{ fontSize: 26 }}>
            {tr('Консоль системного администратора', 'Tizim administratori konsoli')}
          </h2>
          <p className="sg-subtitle">
            {tr('Войдите для управления платформой, биллингом и безопасностью.', 'Platforma, billing va xavfsizlikni boshqarish uchun kiring.')}
          </p>
          <div className="sg-grid" style={{ marginTop: 16 }}>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
              className="w-full border rounded-lg px-3 py-2 text-sm" onKeyDown={e => e.key === 'Enter' && void login()} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={tr('Пароль', 'Parol')} className="w-full border rounded-lg px-3 py-2 text-sm"
              onKeyDown={e => e.key === 'Enter' && void login()} />
            {loginError && <p style={{ color: '#b91c1c', fontSize: 13, margin: 0 }}>{loginError}</p>}
            <button onClick={() => void login()} disabled={loading} className="sg-btn primary" style={{ width: '100%' }}>
              {loading ? tr('Вход...', 'Kirilmoqda...') : tr('Войти', 'Kirish')}
            </button>
          </div>
        </section>
      </>
    );
  }

  /* ── tab content ─────────────────────────────────────────── */

  const dbOk = Boolean(health?.db?.ok);
  const dbMs: number | null = health?.db?.latencyMs ?? null;
  const redisOk = Boolean(health?.redis?.ok);
  const redisMs: number | null = health?.redis?.latencyMs ?? null;
  const queues: Record<string, any> = health?.queues ?? {};

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview',  label: tr('Обзор', "Ko'rinish") },
    { id: 'invoices',  label: tr('Счета', 'Invoicelar'), badge: pendingInvoices > 0 ? pendingInvoices : undefined },
    { id: 'tenants',   label: tr('Тенанты', 'Tenantlar') },
    { id: 'users',     label: tr('Пользователи', 'Foydalanuvchilar') },
    { id: 'reports',   label: tr('Отчёты', 'Hisobotlar') },
    { id: 'activity',  label: tr('Активность', 'Faollik') },
  ];

  const planColors: Record<string, string> = { FREE: '#6b7280', PRO: '#5b21b6', BUSINESS: '#92400e' };

  function TabOverview() {
    if (initialLoad) {
      return (
        <div className="sg-grid" style={{ gap: 14 }}>
          <div className="sg-grid cols-4" style={{ gap: 12 }}>{[1,2,3,4].map(i => <Skeleton key={i} h={80} r={14} />)}</div>
          <div className="sg-grid cols-4" style={{ gap: 12 }}>{[1,2,3].map(i => <Skeleton key={i} h={80} r={14} />)}</div>
          <Skeleton h={180} r={14} />
          <Skeleton h={140} r={14} />
        </div>
      );
    }

    return (
      <div className="sg-grid" style={{ gap: 14 }}>
        {/* KPI row 1 */}
        <div className="sg-grid cols-4">
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('Тенанты', 'Tenantlar')}</div>
            <div className="sg-kpi-value">{dashboard?.tenants ?? '-'}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('Активные магазины', "Faol do'konlar")}</div>
            <div className="sg-kpi-value">{dashboard?.activeStores ?? '-'}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('Заказы за месяц', 'Oylik buyurtmalar')}</div>
            <div className="sg-kpi-value">{dashboard?.monthlyOrders ?? '-'}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('Выручка инвойсов (месяц)', 'Invoice tushumi (oy)')}</div>
            <div className="sg-kpi-value">{formatMoney(dashboard?.paidRevenueMonth)}</div>
          </article>
        </div>

        {/* KPI row 2 */}
        <div className="sg-grid cols-4">
          <article className="sg-card" style={{ cursor: 'pointer' }} onClick={() => setTab('invoices')}>
            <div className="sg-kpi-label">{tr('Счета на модерации', 'Moderatsiyadagi invoice')}</div>
            <div className="sg-kpi-value" style={{ color: (dashboard?.pendingInvoices ?? 0) > 0 ? '#d97706' : undefined }}>
              {dashboard?.pendingInvoices ?? '-'}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{tr('→ Нажмите для просмотра', "→ Ko'rish uchun bosing")}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('Сумма ожидания', 'Kutilayotgan summa')}</div>
            <div className="sg-kpi-value">{formatMoney(dashboard?.pendingAmount)}</div>
          </article>
          <article className="sg-card">
            <div className="sg-kpi-label">{tr('Оплачено (месяц)', "To'langan (oy)")}</div>
            <div className="sg-kpi-value">{dashboard?.paidInvoicesMonth ?? '-'}</div>
          </article>
        </div>

        {/* Revenue chart */}
        {revenueTrend.length > 0 && (
          <section className="sg-card">
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>{tr('Выручка за 6 месяцев', '6 oylik daromad')}</h3>
            <RevenueChart data={revenueTrend} />
          </section>
        )}

        {/* System health */}
        <section className="sg-card">
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>{tr('Состояние системы', 'Tizim holati')}</h3>
          <div className="sg-grid cols-4">
            <div className="sg-card soft" style={{ padding: 12 }}>
              <div className="sg-kpi-label">PostgreSQL</div>
              <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', marginTop: 6 }}>
                <StatusDot ok={dbOk} />
                {dbOk ? tr('OK', 'OK') : tr('Ошибка', 'Nosoz')}
              </div>
              <div style={{ fontSize: 12, color: latencyColor(dbMs), marginTop: 4 }}>
                {dbMs != null ? `${dbMs} ms` : '—'}
              </div>
            </div>
            <div className="sg-card soft" style={{ padding: 12 }}>
              <div className="sg-kpi-label">Redis</div>
              <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', marginTop: 6 }}>
                <StatusDot ok={redisOk} />
                {redisOk ? tr('OK', 'OK') : tr('Ошибка', 'Nosoz')}
              </div>
              <div style={{ fontSize: 12, color: latencyColor(redisMs), marginTop: 4 }}>
                {redisMs != null ? `${redisMs} ms` : '—'}
              </div>
            </div>
            <div className="sg-card soft" style={{ padding: 12 }}>
              <div className="sg-kpi-label">{tr('Время работы', 'Ish vaqti')}</div>
              <div style={{ fontWeight: 800, marginTop: 6 }}>{formatUptime(health?.runtime?.uptimeSec)}</div>
            </div>
            <div className="sg-card soft" style={{ padding: 12 }}>
              <div className="sg-kpi-label">{tr('Память / Node', 'Xotira / Node')}</div>
              <div style={{ fontWeight: 800, marginTop: 6 }}>
                {health?.runtime?.memoryMb != null ? `${health.runtime.memoryMb} MB` : '—'}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{health?.runtime?.node ?? ''}</div>
            </div>

            {/* Queues */}
            {Object.entries(queues).map(([name, q]: [string, any]) => (
              <div key={name} className="sg-card soft" style={{ padding: 12 }}>
                <div className="sg-kpi-label">Queue: {name}</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 10, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: '#2563eb' }}>{tr('Ожидает', 'Kutmoqda')}: <strong>{q.waiting}</strong></span>
                  <span style={{ color: '#059669' }}>{tr('Активно', 'Faol')}: <strong>{q.active}</strong></span>
                  <span style={{ color: q.failed > 0 ? '#dc2626' : '#9ca3af' }}>{tr('Ошибки', 'Xato')}: <strong>{q.failed}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Reminder settings */}
        <section className="sg-card">
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>
            {tr('Напоминания о продлении', 'Yangilash eslatmalari')}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)}
                style={{ accentColor: 'var(--sg-brand)', width: 16, height: 16 }} />
              {tr('Включить напоминания', 'Eslatmalarni yoqish')}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{tr('За N дней:', 'N kun oldin:')}</span>
              <input value={reminderDaysInput} onChange={e => setReminderDaysInput(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" style={{ width: 140 }} placeholder="7,3,1" />
            </div>
            <Button onClick={() => void saveReminderSettings()} className="sg-btn primary" disabled={reminderSaving}>
              {reminderSaving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
            </Button>
          </div>
          <p className="sg-subtitle" style={{ marginTop: 8 }}>
            {tr('Дни через запятую, 1–30. Бот отправит напоминания арендаторам.', "Kunlar vergul bilan, 1–30. Bot tenantlarga eslatma jo'natadi.")}
          </p>
        </section>
      </div>
    );
  }

  function TabInvoices() {
    const totalPages = Math.ceil(invoiceTotal / PAGE_SIZE);
    if (initialLoad) return <div className="sg-grid" style={{ gap: 10 }}>{[1,2,3].map(i => <Skeleton key={i} h={110} r={12} />)}</div>;
    return (
      <div className="sg-grid" style={{ gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={invoiceStatus} onChange={e => setInvoiceStatus(e.target.value as InvoiceStatus | '')}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">{tr('Все статусы', 'Barcha statuslar')}</option>
            <option value="PENDING">{statusLabel.PENDING}</option>
            <option value="PAID">{statusLabel.PAID}</option>
            <option value="CANCELLED">{statusLabel.CANCELLED}</option>
            <option value="EXPIRED">{statusLabel.EXPIRED}</option>
          </select>
          <input value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void load()}
            placeholder={tr('Поиск tenant / ref', 'Tenant / ref qidirish')}
            className="border rounded-lg px-3 py-2 text-sm" style={{ minWidth: 200 }} />
          <Button onClick={() => { setInvoicePage(1); void load(false, { invoicePg: 1 }); }} className="sg-btn ghost">{tr('Применить', "Qo'llash")}</Button>
          <Button onClick={() => setShowInvoiceForm(true)} className="sg-btn primary">+ {tr('Создать инвойс', 'Invoice yaratish')}</Button>
          <Button onClick={() => exportCsv('invoices.csv',
            invoices.map(inv => [inv.tenant?.name ?? inv.tenantId, inv.plan, String(inv.amount), inv.status, inv.paymentRef ?? '', inv.createdAt ?? '']),
            ['Tenant', 'Plan', 'Amount', 'Status', 'PaymentRef', 'Created']
          )} className="sg-btn ghost">↓ CSV</Button>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{invoiceTotal} {tr('всего', 'jami')}</span>
        </div>

        {/* Invoice creation modal */}
        {showInvoiceForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="sg-card" style={{ width: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Создать инвойс', 'Invoice yaratish')}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>{tr('Тенант', 'Tenant')}</label>
                <select value={invoiceForm.tenantId} onChange={e => setInvoiceForm(f => ({ ...f, tenantId: e.target.value }))}
                  className="border rounded-lg px-3 py-2 text-sm">
                  <option value="">— {tr('выберите', 'tanlang')} —</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.plan})</option>)}
                </select>
                <label style={{ fontSize: 13, fontWeight: 600 }}>{tr('Тариф', 'Tarif')}</label>
                <select value={invoiceForm.plan} onChange={e => setInvoiceForm(f => ({ ...f, plan: e.target.value }))}
                  className="border rounded-lg px-3 py-2 text-sm">
                  <option value="FREE">FREE</option>
                  <option value="PRO">PRO</option>
                  <option value="BUSINESS">BUSINESS</option>
                </select>
                <label style={{ fontSize: 13, fontWeight: 600 }}>{tr('Сумма (UZS)', "Summa (UZS)")}</label>
                <input type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))}
                  className="border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 500000" />
                <label style={{ fontSize: 13, fontWeight: 600 }}>Payment Ref</label>
                <input value={invoiceForm.paymentRef} onChange={e => setInvoiceForm(f => ({ ...f, paymentRef: e.target.value }))}
                  className="border rounded-lg px-3 py-2 text-sm" placeholder={tr('Необязательно', 'Ixtiyoriy')} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={invoiceForm.autoConfirm} onChange={e => setInvoiceForm(f => ({ ...f, autoConfirm: e.target.checked }))}
                    style={{ width: 16, height: 16 }} />
                  {tr('Сразу подтвердить (активировать тариф)', 'Darhol tasdiqlash (tarifni faollashtirish)')}
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button onClick={() => setShowInvoiceForm(false)} className="sg-btn ghost">{tr('Отмена', 'Bekor qilish')}</Button>
                <Button onClick={() => void submitInvoiceForm()} className="sg-btn primary" disabled={invoiceFormSaving}>
                  {invoiceFormSaving ? tr('Создание...', 'Yaratilmoqda...') : tr('Создать', 'Yaratish')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {invoices.length === 0 && (
          <div className="sg-card" style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ color: '#9ca3af', margin: 0 }}>{tr('Инвойсы не найдены', 'Invoice topilmadi')}</p>
          </div>
        )}

        <div className="sg-grid cols-2" style={{ gap: 10 }}>
          {invoices.map(invoice => (
            <div key={invoice.id} className="sg-card soft" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{invoice.tenant?.name || invoice.tenantId}</p>
                  <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: 17, color: '#0f172a' }}>{formatMoney(invoice.amount)}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#738178' }}>
                    {tr('Тариф', 'Tarif')}: <strong>{invoice.plan}</strong>
                    {invoice.paymentRef && <span style={{ marginLeft: 8 }}>· {invoice.paymentRef}</span>}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>
                    {invoice.createdAt ? new Date(invoice.createdAt).toLocaleString(locale) : ''}
                  </p>
                </div>
                <span className="sg-badge" style={{ ...invoiceBadgeStyle(invoice.status), flexShrink: 0 }}>
                  {statusLabel[invoice.status as InvoiceStatus] || invoice.status}
                </span>
              </div>
              {invoice.status === 'PENDING' && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <Button onClick={() => void moderateInvoice(invoice.id, 'confirm')} className="sg-btn primary">{tr('Подтвердить', 'Tasdiqlash')}</Button>
                  <Button onClick={() => void moderateInvoice(invoice.id, 'reject')} className="sg-btn danger">{tr('Отклонить', 'Rad etish')}</Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <Button className="sg-btn ghost" disabled={invoicePage <= 1}
              onClick={() => { const p = invoicePage - 1; setInvoicePage(p); void load(false, { invoicePg: p }); }}>←</Button>
            <span style={{ fontSize: 13, color: '#374151' }}>{invoicePage} / {totalPages}</span>
            <Button className="sg-btn ghost" disabled={invoicePage >= totalPages}
              onClick={() => { const p = invoicePage + 1; setInvoicePage(p); void load(false, { invoicePg: p }); }}>→</Button>
          </div>
        )}
      </div>
    );
  }

  function TabTenants() {
    const totalPages = Math.ceil(tenantTotal / PAGE_SIZE);
    if (initialLoad) return <div className="sg-grid cols-2" style={{ gap: 10 }}>{[1,2,3,4].map(i => <Skeleton key={i} h={130} r={12} />)}</div>;
    return (
      <div className="sg-grid" style={{ gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={tenantSearch} onChange={e => setTenantSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void load()}
            placeholder={tr('Поиск по названию или slug', "Nom yoki slug bo'yicha")}
            className="border rounded-lg px-3 py-2 text-sm" style={{ minWidth: 250 }} />
          <Button onClick={() => { setTenantPage(1); void load(false, { tenantPg: 1 }); }} className="sg-btn ghost">{tr('Применить', "Qo'llash")}</Button>
          <Button onClick={() => exportCsv('tenants.csv',
            tenants.map(t => [t.name, t.slug, t.plan, t.planExpiresAt ? new Date(t.planExpiresAt).toLocaleDateString() : '', String(t._count?.orders ?? ''), String(t._count?.users ?? '')]),
            ['Name', 'Slug', 'Plan', 'PlanExpires', 'Orders', 'Users']
          )} className="sg-btn ghost">↓ CSV</Button>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{tenantTotal} {tr('тенантов', 'tenant')}</span>
        </div>

        <div className="sg-grid cols-2" style={{ gap: 10 }}>
          {tenants.map(tenant => {
            const isArmed = planConfirm?.tenantId === tenant.id;
            return (
              <div key={tenant.id} className="sg-card soft" style={{ padding: 14, cursor: 'pointer' }}
                onClick={e => { if ((e.target as HTMLElement).closest('button,input,select')) return; setSelectedTenant(tenant); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{tenant.name}</p>
                    <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 12 }}>{tenant.slug}</p>
                    {tenant.planExpiresAt && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                        {tr('До', 'Gacha')}: {new Date(tenant.planExpiresAt).toLocaleDateString(locale)}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
                      {tenant._count && (
                        <>
                          <span>{tr('Заказов', 'Buyurtma')}: {tenant._count.orders}</span>
                          <span>{tr('Товаров', 'Mahsulot')}: {tenant._count.products}</span>
                          <span>{tr('Польз.', 'Foydalanuvchi')}: {tenant._count.users}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="sg-badge" style={planBadgeStyle(tenant.plan)}>{tenant.plan}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{tr('Нажмите для деталей', "Batafsil uchun bosing")}</span>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="date" value={tenantPlanExpires[tenant.id] || ''}
                    onChange={e => setTenantPlanExpires(prev => ({ ...prev, [tenant.id]: e.target.value }))}
                    className="border rounded-lg px-3 py-2 text-sm" style={{ fontSize: 12 }} onClick={e => e.stopPropagation()} />
                  <Button onClick={e => { e.stopPropagation(); setTenantPlanExpires(prev => ({ ...prev, [tenant.id]: '' })); }}
                    className="sg-btn ghost" style={{ fontSize: 11 }}>{tr('Без срока', 'Muddatsiz')}</Button>
                </div>

                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(['FREE', 'PRO', 'BUSINESS'] as const).map(plan => {
                    const armed = isArmed && planConfirm?.plan === plan;
                    return (
                      <button key={plan} onClick={e => { e.stopPropagation(); requestPlanChange(tenant.id, plan); }}
                        style={{
                          border: `1.5px solid ${armed ? planColors[plan] : '#e5e7eb'}`,
                          borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', background: armed ? planColors[plan] : 'transparent',
                          color: armed ? '#fff' : (planColors[plan] ?? '#374151'), transition: 'all 0.15s',
                        }}>
                        {armed ? `✓ ${plan}?` : plan}
                      </button>
                    );
                  })}
                  {isArmed && (
                    <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                      {tr('Нажмите ещё раз', 'Yana bosing')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {tenants.length === 0 && (
          <div className="sg-card" style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ color: '#9ca3af', margin: 0 }}>{tr('Нет тенантов', "Tenantlar yo'q")}</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <Button className="sg-btn ghost" disabled={tenantPage <= 1}
              onClick={() => { const p = tenantPage - 1; setTenantPage(p); void load(false, { tenantPg: p }); }}>←</Button>
            <span style={{ fontSize: 13, color: '#374151' }}>{tenantPage} / {totalPages}</span>
            <Button className="sg-btn ghost" disabled={tenantPage >= totalPages}
              onClick={() => { const p = tenantPage + 1; setTenantPage(p); void load(false, { tenantPg: p }); }}>→</Button>
          </div>
        )}

        {/* Stores */}
        <section className="sg-card" style={{ marginTop: 4 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>{tr('Магазины', "Do'konlar")}</h3>
          <div className="sg-grid cols-3" style={{ gap: 8 }}>
            {stores.map(store => (
              <div key={store.id} className="sg-card soft" style={{ padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{store.name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>{store.tenant?.name || '—'}</p>
                  </div>
                  <span className="sg-badge" style={{ background: store.isActive ? '#d1fae5' : '#f3f4f6', color: store.isActive ? '#065f46' : '#4b5563', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <StatusDot ok={store.isActive} />
                    {store.isActive ? tr('Активен', 'Faol') : tr('Откл.', "O'ch.")}
                  </span>
                </div>
              </div>
            ))}
            {stores.length === 0 && <p className="sg-subtitle">{tr('Магазины не найдены', "Do'konlar yo'q")}</p>}
          </div>
        </section>
      </div>
    );
  }

  function TabUsers() {
    const totalPages = Math.ceil(userTotal / PAGE_SIZE);
    if (initialLoad) return <div className="sg-grid" style={{ gap: 10 }}>{[1,2,3].map(i => <Skeleton key={i} h={80} r={12} />)}</div>;
    return (
      <div className="sg-grid" style={{ gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void load()}
            className="border rounded-lg px-3 py-2 text-sm" style={{ minWidth: 260 }}
            placeholder={tr('Поиск email / имя', 'Email / ism qidirish')} />
          <Button onClick={() => { setUserPage(1); void load(false, { userPg: 1 }); }} className="sg-btn ghost">{tr('Применить', "Qo'llash")}</Button>
          <Button onClick={() => exportCsv('users.csv',
            users.map(u => [u.name, u.email, u.role, u.tenant?.name ?? '', u.isActive ? 'yes' : 'no', u.createdAt ?? '']),
            ['Name', 'Email', 'Role', 'Tenant', 'Active', 'Created']
          )} className="sg-btn ghost">↓ CSV</Button>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{userTotal} {tr('пользователей', 'foydalanuvchi')}</span>
        </div>

        {users.length === 0 && (
          <div className="sg-card" style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ color: '#9ca3af', margin: 0 }}>{tr('Пользователи не найдены', "Foydalanuvchilar yo'q")}</p>
          </div>
        )}

        <div className="sg-grid" style={{ gap: 8 }}>
          {users.map(user => (
            <div key={user.id} className="sg-card soft" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {user.name}
                    <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 6 }}>({user.email})</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64756b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{user.tenant?.name || '—'}</span>
                    <span style={{ color: '#e5e7eb' }}>·</span>
                    <span style={{ fontWeight: 600 }}>{user.role}</span>
                    <span style={{ color: '#e5e7eb' }}>·</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <StatusDot ok={user.isActive} />
                      {user.isActive ? tr('активен', 'faol') : tr('отключён', "o'chirilgan")}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="password" value={resetPasswords[user.id] || ''}
                    onChange={e => setResetPasswords(prev => ({ ...prev, [user.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && void resetUserPassword(user.id, user.email)}
                    className="border rounded-lg px-3 py-2 text-sm" style={{ width: 160 }}
                    placeholder={tr('Новый пароль', 'Yangi parol')} />
                  <Button onClick={() => void resetUserPassword(user.id, user.email)} className="sg-btn ghost">
                    {tr('Сбросить', 'Tiklash')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <Button className="sg-btn ghost" disabled={userPage <= 1}
              onClick={() => { const p = userPage - 1; setUserPage(p); void load(false, { userPg: p }); }}>←</Button>
            <span style={{ fontSize: 13, color: '#374151' }}>{userPage} / {totalPages}</span>
            <Button className="sg-btn ghost" disabled={userPage >= totalPages}
              onClick={() => { const p = userPage + 1; setUserPage(p); void load(false, { userPg: p }); }}>→</Button>
          </div>
        )}
      </div>
    );
  }

  function TabReports() {
    if (initialLoad) return <div className="sg-grid" style={{ gap: 10 }}>{[1,2,3].map(i => <Skeleton key={i} h={80} r={12} />)}</div>;
    return (
      <div className="sg-grid" style={{ gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tr('Месяц:', 'Oy:')}</label>
          <input value={reportUsageMonth} onChange={e => setReportUsageMonth(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void load()}
            className="border rounded-lg px-3 py-2 text-sm" style={{ width: 130 }} placeholder="YYYY-MM" />
          <Button onClick={() => void load()} className="sg-btn ghost">{tr('Обновить', 'Yangilash')}</Button>
          <Button onClick={() => exportCsv('report-usage.csv',
            reportUsage.map(r => [r.tenantName, r.plan, String(r.exportsUsed), String(r.maxExportsPerMonth), String(r.exportsLeft), r.blockedByLimit ? 'yes' : 'no']),
            ['Tenant', 'Plan', 'Used', 'Max', 'Left', 'Blocked']
          )} className="sg-btn ghost">↓ CSV</Button>
        </div>

        <div className="sg-grid cols-4">
          <div className="sg-card soft" style={{ padding: 12 }}>
            <div className="sg-kpi-label">{tr('Экспортов использовано', 'Eksport ishlatilgan')}</div>
            <div className="sg-kpi-value" style={{ fontSize: 22 }}>{reportUsageSummary?.totalExportsUsed ?? 0}</div>
          </div>
          <div className="sg-card soft" style={{ padding: 12 }}>
            <div className="sg-kpi-label">{tr('Экспорт включён', 'Eksport yoqilgan')}</div>
            <div className="sg-kpi-value" style={{ fontSize: 22 }}>{reportUsageSummary?.tenantsWithExport ?? 0}</div>
          </div>
          <div className="sg-card soft" style={{ padding: 12 }}>
            <div className="sg-kpi-label">{tr('На лимите', 'Limitga yetgan')}</div>
            <div className="sg-kpi-value" style={{ fontSize: 22, color: (reportUsageSummary?.blockedTenants ?? 0) > 0 ? '#dc2626' : undefined }}>
              {reportUsageSummary?.blockedTenants ?? 0}
            </div>
          </div>
        </div>

        <div className="sg-grid cols-2" style={{ gap: 8 }}>
          {reportUsage.map(row => (
            <div key={row.tenantId} className="sg-card soft" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>{row.tenantName}</p>
                  <p style={{ margin: 0, color: '#9ca3af', fontSize: 12 }}>{row.tenantSlug}</p>
                </div>
                <span className="sg-badge" style={planBadgeStyle(row.plan)}>{row.plan}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 13 }}>
                <span style={{ color: '#526258' }}>
                  {tr('Экспорт', 'Eksport')}: <strong>{row.exportsUsed}</strong> / {row.maxExportsPerMonth < 0 ? '∞' : row.maxExportsPerMonth}
                </span>
                <span style={{ color: row.blockedByLimit ? '#b91c1c' : '#64756b', fontWeight: row.blockedByLimit ? 700 : 400 }}>
                  {tr('Осталось', 'Qoldi')}: {row.exportsLeft < 0 ? '∞' : row.exportsLeft}
                  {row.blockedByLimit && <span style={{ marginLeft: 4, color: '#ef4444' }}>⚠</span>}
                </span>
              </div>
              {row.maxExportsPerMonth > 0 && (
                <div style={{ marginTop: 8, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${row.usagePercent ?? 0}%`, background: row.blockedByLimit ? '#ef4444' : '#3b82f6', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              )}
            </div>
          ))}
          {reportUsage.length === 0 && <p className="sg-subtitle">{tr('Нет данных', "Ma'lumot yo'q")}</p>}
        </div>
      </div>
    );
  }

  function TabActivity() {
    if (initialLoad) return <div className="sg-grid" style={{ gap: 10 }}>{[1,2,3,4].map(i => <Skeleton key={i} h={70} r={12} />)}</div>;
    return (
      <div className="sg-grid" style={{ gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={activityType} onChange={e => setActivityType(e.target.value as ActivityType | '')} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">{tr('Все действия', 'Barcha harakatlar')}</option>
            <option value="TENANT_PLAN_UPDATED">{activityTypeLabel.TENANT_PLAN_UPDATED}</option>
            <option value="INVOICE_CONFIRMED">{activityTypeLabel.INVOICE_CONFIRMED}</option>
            <option value="INVOICE_REJECTED">{activityTypeLabel.INVOICE_REJECTED}</option>
          </select>
          <select value={activityTarget} onChange={e => setActivityTarget(e.target.value as ActivityTarget | '')} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">{tr('Все объекты', 'Barcha obyektlar')}</option>
            <option value="tenant">{tr('Тенанты', 'Tenantlar')}</option>
            <option value="invoice">{tr('Инвойсы', 'Invoicelar')}</option>
          </select>
          <input value={activitySearch} onChange={e => setActivitySearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void load()}
            placeholder={tr('Поиск', 'Qidirish')} className="border rounded-lg px-3 py-2 text-sm" style={{ minWidth: 140 }} />
          <input type="date" value={activityDateFrom} onChange={e => setActivityDateFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={activityDateTo} onChange={e => setActivityDateTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
          <Button onClick={() => void load()} className="sg-btn ghost">{tr('Применить', "Qo'llash")}</Button>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{activity.length} {tr('записей', 'yozuv')}</span>
        </div>

        {activity.length === 0 && (
          <div className="sg-card" style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ color: '#9ca3af', margin: 0 }}>{tr('События пока нет', "Hali harakatlar yo'q")}</p>
          </div>
        )}

        <div className="sg-grid" style={{ gap: 6 }}>
          {activity.map(item => {
            const details: any = item.context || {};
            const label = details.event === 'TENANT_BLOCKED' ? tr('Тенант заблокирован', 'Tenant bloklandi')
              : details.event === 'TENANT_UNBLOCKED' ? tr('Тенант разблокирован', 'Tenant blokdan chiqdi')
              : details.event === 'USER_PASSWORD_RESET' ? tr('Пароль сброшен', 'Parol tiklandi')
              : activityTypeLabel[item.type as ActivityType] || item.message;
            const dotColor = item.type === 'INVOICE_CONFIRMED' ? '#00b96b'
              : item.type === 'INVOICE_REJECTED' ? '#ef4444' : '#6366f1';
            return (
              <div key={item.id} className="sg-card soft" style={{ padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dotColor }} />
                    <strong style={{ fontSize: 13 }}>{label}</strong>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{details.tenantName || item.context?.tenantId || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#9ca3af' }}>
                    <span>{tr('Исполнитель', 'Ijrochi')}: {item.actor || tr('система', 'tizim')}</span>
                    <span>{new Date(item.at).toLocaleString(locale)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── main render ─────────────────────────────────────────── */

  return (
    <>
      {noticeNode}

      {selectedTenant && (
        <TenantDrawer
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          locale={locale}
          tr={tr}
          onBlock={async () => {
            await systemApi.blockTenant(selectedTenant.id);
            await load(true);
            showNotice('success', tr('Тенант заблокирован', 'Tenant bloklandi'));
          }}
          onUnblock={async () => {
            await systemApi.unblockTenant(selectedTenant.id);
            await load(true);
            showNotice('success', tr('Тенант разблокирован', 'Tenant blokdan chiqarildi'));
          }}
          onImpersonate={() => handleImpersonate(selectedTenant.id)}
        />
      )}

      <section className="sg-page sg-grid" style={{ gap: 16, maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 className="sg-title" style={{ marginBottom: 2 }}>{tr('Системный администратор', 'Tizim admin konsoli')}</h2>
            <p className="sg-subtitle" style={{ margin: 0 }}>
              {tr('Операции, модерация billing и контроль платформы.', 'Operatsiyalar, billing moderatsiyasi va platforma nazorati.')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['ru', 'uz'] as const).map(l => (
              <button key={l} type="button" onClick={() => setLang(l)} className="sg-btn ghost"
                style={{ fontWeight: 800, fontSize: 12, padding: '4px 12px', ...(lang === l ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : {}) }}>
                {l.toUpperCase()}
              </button>
            ))}
            <Button onClick={() => void load(true)} className="sg-btn ghost" disabled={refreshing}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', transition: 'transform 0.6s', transform: refreshing ? 'rotate(360deg)' : 'none' }}>↻</span>
              {tr('Обновить', 'Yangilash')}
            </Button>
            <Button onClick={goToStoreAdmin} className="sg-btn ghost">{tr('Панель магазина', "Do'kon paneli")}</Button>
            <Button onClick={logout} className="sg-btn danger">{tr('Выход', 'Chiqish')}</Button>
          </div>
        </header>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                padding: '10px 16px', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? '#0f172a' : '#6b7280',
                borderBottom: tab === t.id ? '2px solid #0f172a' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.14s', display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {t.label}
              {t.badge != null && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 800, lineHeight: 1.4 }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {tab === 'overview'  && <TabOverview />}
        {tab === 'invoices'  && <TabInvoices />}
        {tab === 'tenants'   && <TabTenants />}
        {tab === 'users'     && <TabUsers />}
        {tab === 'reports'   && <TabReports />}
        {tab === 'activity'  && <TabActivity />}

      </section>
    </>
  );
}
