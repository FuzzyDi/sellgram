import React, { useEffect, useMemo, useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../api/system-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

type InvoiceStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
type ActivityType = 'TENANT_PLAN_UPDATED' | 'INVOICE_CONFIRMED' | 'INVOICE_REJECTED';
type ActivityTarget = 'tenant' | 'invoice';
type NoticeTone = 'success' | 'error' | 'info';

function langBtn(active: boolean): React.CSSProperties {
  return {
    border: '1px solid #cfd8d3',
    borderRadius: 999,
    height: 32,
    minWidth: 46,
    padding: '0 12px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    color: active ? '#ffffff' : '#1f2937',
    background: active ? '#0f172a' : '#ffffff',
  };
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
      PENDING: tr('Ожидает', 'Kutilmoqda'),
      PAID: tr('Оплачен', "To'langan"),
      CANCELLED: tr('Отклонен', 'Rad etilgan'),
      EXPIRED: tr('Просрочен', "Muddati o'tgan"),
    }),
    [tr]
  );

  const activityTypeLabel = useMemo(
    () => ({
      TENANT_PLAN_UPDATED: tr('Тариф обновлен', 'Tarif yangilandi'),
      INVOICE_CONFIRMED: tr('Инвойс подтвержден', 'Invoice tasdiqlandi'),
      INVOICE_REJECTED: tr('Инвойс отклонен', 'Invoice rad etildi'),
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
      setLoginError(err?.message || tr('Ошибка входа', 'Kirish xatosi'));
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
      showNotice('error', tr('Укажите дни через запятую, например: 7,3,1', 'Kunlarni vergul bilan kiriting: 7,3,1'));
      return;
    }

    setReminderSaving(true);
    try {
      const data = await systemApi.updateReminderSettings({ enabled: reminderEnabled, days });
      setReminderEnabled(Boolean(data?.enabled));
      setReminderDaysInput(Array.isArray(data?.days) ? data.days.join(',') : days.join(','));
      await load();
      showNotice('success', tr('Настройки напоминаний сохранены', 'Eslatma sozlamalari saqlandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setReminderSaving(false);
    }
  }

  async function setPlan(tenantId: string, plan: 'FREE' | 'PRO' | 'BUSINESS') {
    try {
      const expires = tenantPlanExpires[tenantId]?.trim();
      await systemApi.setTenantPlan(tenantId, plan, expires || undefined);
      await load();
      showNotice('success', tr('Тариф обновлен', 'Tarif yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function moderateInvoice(id: string, action: 'confirm' | 'reject') {
    try {
      if (action === 'confirm') await systemApi.confirmInvoice(id);
      else await systemApi.rejectInvoice(id);
      await load();
      showNotice('success', action === 'confirm' ? tr('Инвойс подтвержден', 'Invoice tasdiqlandi') : tr('Инвойс отклонен', 'Invoice rad etildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function resetUserPassword(userId: string, userEmail: string) {
    const newPassword = (resetPasswords[userId] || '').trim();
    if (newPassword.length < 6) {
      showNotice('error', tr('Пароль должен быть минимум 6 символов', 'Parol kamida 6 belgidan iborat bo\'lsin'));
      return;
    }

    try {
      await systemApi.resetUserPassword(userId, newPassword);
      setResetPasswords((prev) => ({ ...prev, [userId]: '' }));
      showNotice('success', tr(`Пароль обновлен: ${userEmail}`, `${userEmail} uchun parol yangilandi`));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сброса пароля', 'Parolni tiklashda xato'));
    }
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, gap: 6 }}>
            <button type="button" onClick={() => setLang('ru')} style={langBtn(lang === 'ru')}>RU</button>
            <button type="button" onClick={() => setLang('uz')} style={langBtn(lang === 'uz')}>UZ</button>
          </div>
          <h2 className="sg-title" style={{ fontSize: 28 }}>{tr('Консоль системного администратора', 'Tizim administratori konsoli')}</h2>
          <p className="sg-subtitle">{tr('Войдите для управления платформой, биллингом и безопасностью.', 'Platforma, billing va xavfsizlikni boshqarish uchun kiring.')}</p>
          <div className="sg-grid" style={{ marginTop: 14 }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr('Пароль', 'Parol')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            {loginError && <p style={{ color: '#b91c1c', fontSize: 13 }}>{loginError}</p>}
            <button onClick={() => void login()} disabled={loading} className="sg-btn primary" style={{ width: '100%' }}>
              {loading ? tr('Вход...', 'Kirilmoqda...') : tr('Войти', 'Kirish')}
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
            <h2 className="sg-title">{tr('Консоль системного админа', 'Tizim admin konsoli')}</h2>
            <p className="sg-subtitle">{tr('Операции, модерация billing и контроль платформы.', 'Operatsiyalar, billing moderatsiyasi va platforma nazorati.')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setLang('ru')} style={langBtn(lang === 'ru')}>RU</button>
            <button type="button" onClick={() => setLang('uz')} style={langBtn(lang === 'uz')}>UZ</button>
            <Button onClick={goToStoreAdmin} className="sg-btn ghost">{tr('Панель магазина', "Do'kon paneli")}</Button>
            <Button onClick={logout} className="sg-btn danger">{tr('Выход', 'Chiqish')}</Button>
          </div>
        </header>

        <div className="sg-grid cols-4">
          <article className="sg-card"><div className="sg-kpi-label">{tr('Тенанты', 'Tenantlar')}</div><div className="sg-kpi-value">{dashboard?.tenants ?? '-'}</div></article>
          <article className="sg-card"><div className="sg-kpi-label">{tr('Активные магазины', "Faol do'konlar")}</div><div className="sg-kpi-value">{dashboard?.activeStores ?? '-'}</div></article>
          <article className="sg-card"><div className="sg-kpi-label">{tr('Счета на модерации', 'Moderatsiyadagi invoice')}</div><div className="sg-kpi-value">{dashboard?.pendingInvoices ?? '-'}</div></article>
          <article className="sg-card"><div className="sg-kpi-label">{tr('Сумма ожидания', 'Kutilayotgan summa')}</div><div className="sg-kpi-value">{formatMoney(dashboard?.pendingAmount)}</div></article>
          <article className="sg-card"><div className="sg-kpi-label">{tr('Оплачено (месяц)', "To'langan (oy)")}</div><div className="sg-kpi-value">{dashboard?.paidInvoicesMonth ?? '-'}</div></article>
          <article className="sg-card"><div className="sg-kpi-label">{tr('Выручка инвойсов (месяц)', 'Invoice tushumi (oy)')}</div><div className="sg-kpi-value">{formatMoney(dashboard?.paidRevenueMonth)}</div></article>
          <article className="sg-card"><div className="sg-kpi-label">{tr('Заказы за месяц', 'Oylik buyurtmalar')}</div><div className="sg-kpi-value">{dashboard?.monthlyOrders ?? '-'}</div></article>
        </div>

        <section className="sg-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Пользователи магазинов', "Do'kon foydalanuvchilari")}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" placeholder={tr('Поиск email / имя', 'Email / ism qidirish')} />
              <Button onClick={() => void load()} className="sg-btn ghost">{tr('Применить', "Qo'llash")}</Button>
            </div>
          </div>
          <div className="sg-grid" style={{ marginTop: 12, maxHeight: 320, overflow: 'auto' }}>
            {users.map((user) => (
              <div key={user.id} className="sg-card soft" style={{ padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{user.name} ({user.email})</div>
                    <div style={{ fontSize: 12, color: '#64756b' }}>{user.tenant?.name || '-'} • {user.role} • {user.isActive ? tr('активен', 'faol') : tr('отключен', "o'chirilgan")}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="password"
                      value={resetPasswords[user.id] || ''}
                      onChange={(e) => setResetPasswords((prev) => ({ ...prev, [user.id]: e.target.value }))}
                      className="border rounded-lg px-3 py-2 text-sm"
                      placeholder={tr('Новый пароль', 'Yangi parol')}
                    />
                    <Button onClick={() => void resetUserPassword(user.id, user.email)} className="sg-btn ghost">{tr('Сбросить пароль', 'Parolni tiklash')}</Button>
                  </div>
                </div>
              </div>
            ))}
            {users.length === 0 && <p className="sg-subtitle">{tr('Пользователи не найдены', "Foydalanuvchilar yo'q")}</p>}
          </div>
        </section>

        <section className="sg-card">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Состояние системы', 'Tizim holati')}</h3>
          <div className="sg-grid cols-4" style={{ marginTop: 10 }}>
            <div className="sg-card soft" style={{ padding: 10 }}><div className="sg-kpi-label">DB</div><div style={{ fontWeight: 800 }}>{health?.db?.ok ? tr('Подключена', 'Ulangan') : tr('Ошибка', 'Nosoz')}</div></div>
            <div className="sg-card soft" style={{ padding: 10 }}><div className="sg-kpi-label">DB ms</div><div style={{ fontWeight: 800 }}>{health?.db?.latencyMs ?? '-'}</div></div>
            <div className="sg-card soft" style={{ padding: 10 }}><div className="sg-kpi-label">{tr('Время работы', 'Ish vaqti')}</div><div style={{ fontWeight: 800 }}>{health?.runtime?.uptimeSec ?? '-'}s</div></div>
            <div className="sg-card soft" style={{ padding: 10 }}><div className="sg-kpi-label">{tr('Память', 'Xotira')}</div><div style={{ fontWeight: 800 }}>{health?.runtime?.memoryMb ?? '-'} MB</div></div>
            <div className="sg-card soft" style={{ padding: 12, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                  <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />
                  {tr('Включить напоминания', 'Eslatmalarni yoqish')}
                </label>
                <input value={reminderDaysInput} onChange={(e) => setReminderDaysInput(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" style={{ minWidth: 220 }} placeholder="7,3,1" />
                <Button onClick={() => void saveReminderSettings()} className="sg-btn primary" disabled={reminderSaving}>{reminderSaving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}</Button>
              </div>
              <p className="sg-subtitle" style={{ marginTop: 8 }}>{tr('Дни через запятую, 1..30', 'Kunlar vergul bilan, 1..30')}</p>
            </div>
          </div>
        </section>

        <div className="sg-grid cols-2">
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Модерация инвойсов', 'Invoice moderatsiyasi')}</h3>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as InvoiceStatus | '')} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">{tr('Все статусы', 'Barcha statuslar')}</option>
                <option value="PENDING">{statusLabel.PENDING}</option>
                <option value="PAID">{statusLabel.PAID}</option>
                <option value="CANCELLED">{statusLabel.CANCELLED}</option>
                <option value="EXPIRED">{statusLabel.EXPIRED}</option>
              </select>
              <input value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} placeholder={tr('Поиск tenant / payment ref', 'Tenant / payment ref qidirish')} className="border rounded-lg px-3 py-2 text-sm" style={{ minWidth: 220 }} />
              <Button onClick={() => void load()} className="sg-btn ghost">{tr('Применить', "Qo'llash")}</Button>
            </div>
            <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
              {invoices.map((invoice) => (
                <div key={invoice.id} className="sg-card soft" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{invoice.tenant?.name || invoice.tenantId}</p>
                    <span className="sg-badge" style={{ background: '#f3f4f6', color: '#374151' }}>{statusLabel[invoice.status as InvoiceStatus] || invoice.status}</span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{formatMoney(invoice.amount)}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#738178' }}>{tr('Тариф', 'Tarif')}: {invoice.plan}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#738178' }}>{invoice.paymentRef || tr('Нет payment ref', "Payment ref yo'q")}</p>
                  {invoice.status === 'PENDING' && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <Button onClick={() => void moderateInvoice(invoice.id, 'confirm')} className="sg-btn primary">{tr('Подтвердить', 'Tasdiqlash')}</Button>
                      <Button onClick={() => void moderateInvoice(invoice.id, 'reject')} className="sg-btn danger">{tr('Отклонить', 'Rad etish')}</Button>
                    </div>
                  )}
                </div>
              ))}
              {invoices.length === 0 && <p className="sg-subtitle">{tr('Инвойсы не найдены', 'Invoice topilmadi')}</p>}
            </div>
          </article>

          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Журнал действий', 'Harakatlar jurnali')}</h3>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <select value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityType | '')} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">{tr('Все действия', 'Barcha harakatlar')}</option>
                <option value="TENANT_PLAN_UPDATED">{activityTypeLabel.TENANT_PLAN_UPDATED}</option>
                <option value="INVOICE_CONFIRMED">{activityTypeLabel.INVOICE_CONFIRMED}</option>
                <option value="INVOICE_REJECTED">{activityTypeLabel.INVOICE_REJECTED}</option>
              </select>
              <select value={activityTarget} onChange={(e) => setActivityTarget(e.target.value as ActivityTarget | '')} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">{tr('Все объекты', 'Barcha obyektlar')}</option>
                <option value="tenant">{tr('Тенанты', 'Tenantlar')}</option>
                <option value="invoice">{tr('Инвойсы', 'Invoicelar')}</option>
              </select>
              <input value={activitySearch} onChange={(e) => setActivitySearch(e.target.value)} placeholder={tr('Поиск', 'Qidirish')} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={activityDateFrom} onChange={(e) => setActivityDateFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={activityDateTo} onChange={(e) => setActivityDateTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              <Button onClick={() => void load()} className="sg-btn ghost">{tr('Применить', "Qo'llash")}</Button>
            </div>
            <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
              {activity.map((item) => (
                <div key={item.id} className="sg-card soft" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{activityTypeLabel[item.type as ActivityType] || item.message}</strong>
                    <span style={{ fontSize: 12, color: '#64756b' }}>{new Date(item.at).toLocaleString(locale)}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64756b' }}>{item.context?.tenantName || item.context?.tenantId || '-'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64756b' }}>{tr('Исполнитель', 'Ijrochi')}: {item.actor || tr('система', 'tizim')}</p>
                </div>
              ))}
              {activity.length === 0 && <p className="sg-subtitle">{tr('Событий пока нет', "Hali harakatlar yo'q")}</p>}
            </div>
          </article>
        </div>

        <div className="sg-grid cols-2">
          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Тенанты', 'Tenantlar')}</h3>
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
                    <input type="date" value={tenantPlanExpires[tenant.id] || ''} onChange={(e) => setTenantPlanExpires((prev) => ({ ...prev, [tenant.id]: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
                    <Button onClick={() => setTenantPlanExpires((prev) => ({ ...prev, [tenant.id]: '' }))} className="sg-btn ghost">{tr('Без срока', 'Muddatsiz')}</Button>
                    <Button onClick={() => void setPlan(tenant.id, 'FREE')} className="sg-btn ghost">FREE</Button>
                    <Button onClick={() => void setPlan(tenant.id, 'PRO')} className="sg-btn ghost">PRO</Button>
                    <Button onClick={() => void setPlan(tenant.id, 'BUSINESS')} className="sg-btn ghost">BUSINESS</Button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="sg-card">
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Магазины', "Do'konlar")}</h3>
            <div className="sg-grid" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto' }}>
              {stores.map((store) => (
                <div key={store.id} className="sg-card soft" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{store.name}</p>
                    <span className="sg-badge" style={{ background: store.isActive ? '#e8f7ef' : '#f3f4f6', color: store.isActive ? '#0f7a4f' : '#4b5563' }}>
                      {store.isActive ? tr('Активен', 'Faol') : tr('Отключен', "O'chirilgan")}
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
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Экспорт отчетов по tenant', "Tenant bo'yicha hisobot eksporti")}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={reportUsageMonth} onChange={(e) => setReportUsageMonth(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" style={{ minWidth: 120 }} placeholder="YYYY-MM" />
              <Button onClick={() => void load()} className="sg-btn ghost">{tr('Обновить', 'Yangilash')}</Button>
            </div>
          </div>

          <div className="sg-grid cols-4" style={{ marginTop: 10 }}>
            <div className="sg-card soft" style={{ padding: 10 }}><div className="sg-kpi-label">{tr('Использовано экспортов', 'Eksport ishlatilgan')}</div><div style={{ fontWeight: 800 }}>{reportUsageSummary?.totalExportsUsed ?? 0}</div></div>
            <div className="sg-card soft" style={{ padding: 10 }}><div className="sg-kpi-label">{tr('Экспорт включен', 'Eksport yoqilgan')}</div><div style={{ fontWeight: 800 }}>{reportUsageSummary?.tenantsWithExport ?? 0}</div></div>
            <div className="sg-card soft" style={{ padding: 10 }}><div className="sg-kpi-label">{tr('На лимите', 'Limitga yetgan')}</div><div style={{ fontWeight: 800 }}>{reportUsageSummary?.blockedTenants ?? 0}</div></div>
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
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#526258' }}>{tr('Экспорт', 'Eksport')}: {row.exportsUsed} / {row.maxExportsPerMonth < 0 ? tr('Безлимит', 'Cheksiz') : row.maxExportsPerMonth}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: row.blockedByLimit ? '#b91c1c' : '#64756b' }}>{tr('Осталось', 'Qoldi')}: {row.exportsLeft < 0 ? tr('Безлимит', 'Cheksiz') : row.exportsLeft}</p>
              </div>
            ))}
            {reportUsage.length === 0 && <p className="sg-subtitle">{tr('Нет данных по экспорту', "Eksport bo'yicha ma'lumot yo'q")}</p>}
          </div>
        </section>

        {loading && <p className="sg-subtitle">{tr('Обновление...', 'Yangilanmoqda...')}</p>}
      </section>
    </>
  );
}