import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type NoticeTone = 'success' | 'error';

type ReportsMeta = {
  reportLimits?: {
    planCode?: string;
    reportsLevel?: string;
    reportsHistoryDays?: number;
    allowReportExport?: boolean;
    maxReportsPerMonth?: number;
    maxScheduledReports?: number;
    maxExportsPerMonth?: number;
  };
  reportAccess?: {
    basic?: boolean;
    advanced?: boolean;
    full?: boolean;
    export?: boolean;
  };
  usage?: {
    exportsThisMonth?: number;
    exportsLeft?: number;
    monthKey?: string;
  };
};

type ScheduledFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type ScheduledReportDraft = {
  reportType: string;
  periodDays: number;
  frequency: ScheduledFrequency;
};

function ScheduledReportsSection({
  limits,
  tr,
}: {
  limits: ReportsMeta['reportLimits'];
  tr: (ru: string, uz: string) => string;
}) {
  const maxAllowed = limits?.maxScheduledReports ?? 0;
  const [schedules, setSchedules] = useState<(ScheduledReportDraft & { id: string; nextRunAt?: string; lastSentAt?: string | null })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<ScheduledReportDraft>({
    reportType: 'top-products',
    periodDays: 30,
    frequency: 'WEEKLY',
  });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (maxAllowed === 0) return;
    adminApi.getScheduledReports()
      .then((data: any[]) => setSchedules(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true));
  }, [maxAllowed]);

  const canAdd = maxAllowed < 0 || schedules.length < maxAllowed;

  async function addSchedule() {
    if (!canAdd || saving) return;
    setSaving(true);
    try {
      const created = await adminApi.createScheduledReport(draft);
      setSchedules((prev) => [...prev, created]);
      setShowForm(false);
    } catch (err: any) {
      alert(err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule(id: string) {
    try {
      await adminApi.deleteScheduledReport(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      alert(err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  const frequencyLabel: Record<ScheduledFrequency, string> = {
    DAILY:   tr('Каждый день', 'Har kuni'),
    WEEKLY:  tr('Каждую неделю', 'Har hafta'),
    MONTHLY: tr('Каждый месяц', 'Har oy'),
  };

  const reportTypeLabel: Record<string, string> = {
    'top-products': tr('Топ товаров', 'Top mahsulotlar'),
    'revenue':      tr('Выручка', 'Tushum'),
    'categories':   tr('Категории', 'Toifalar'),
    'customers':    tr('Клиенты', 'Mijozlar'),
  };

  if (maxAllowed === 0) {
    return (
      <section className="sg-card">
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>
          {tr('Авто-рассылка отчётов', 'Hisobotlarni avtomatik yuborish')}
        </h3>
        <div style={{ padding: '20px 16px', background: 'var(--sg-panel-2)', border: '1px solid var(--sg-border)', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
            {tr('Доступно на PRO и BUSINESS', 'PRO va BUSINESS tariflarida mavjud')}
          </p>
          <p className="sg-subtitle" style={{ marginTop: 4 }}>
            {tr(
              'Автоматически отправляйте CSV-отчёты по расписанию на email',
              'CSV hisobotlarni jadval bo`yicha email ga avtomatik yuboring'
            )}
          </p>
          <button className="sg-btn primary" style={{ marginTop: 12 }} onClick={() => (window.location.hash = '/billing')}>
            {tr('Перейти к тарифам', "Tariflarga o'tish")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="sg-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            {tr('Авто-рассылка отчётов', 'Hisobotlarni avtomatik yuborish')}
          </h3>
          <p className="sg-subtitle" style={{ marginTop: 2 }}>
            {tr('Отчёты по расписанию на email', 'Email ga jadval bo`yicha hisobotlar')}
            {maxAllowed > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 600 }}>
                ({schedules.length}/{maxAllowed})
              </span>
            )}
          </p>
        </div>
        <button
          className="sg-btn primary"
          onClick={() => setShowForm(true)}
          disabled={!canAdd || showForm}
          style={{ whiteSpace: 'nowrap' }}
        >
          + {tr('Добавить', "Qo'shish")}
        </button>
      </div>

      {showForm && (
        <div style={{ border: '1px solid var(--sg-border)', borderRadius: 12, padding: 14, marginBottom: 12, background: 'var(--sg-panel-2)' }}>
          <div className="sg-grid cols-3" style={{ gap: 10, marginBottom: 12 }}>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>
                {tr('Тип отчёта', 'Hisobot turi')}
              </label>
              <select
                value={draft.reportType}
                onChange={(e) => setDraft((d) => ({ ...d, reportType: e.target.value }))}
                style={{ width: '100%', border: '1px solid var(--sg-border)', borderRadius: 8, padding: '8px 10px' }}
              >
                {Object.entries(reportTypeLabel).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>
                {tr('Период (дней)', 'Davr (kun)')}
              </label>
              <select
                value={draft.periodDays}
                onChange={(e) => setDraft((d) => ({ ...d, periodDays: Number(e.target.value) }))}
                style={{ width: '100%', border: '1px solid var(--sg-border)', borderRadius: 8, padding: '8px 10px' }}
              >
                {[7, 14, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>{d} {tr('дней', 'kun')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>
                {tr('Частота', 'Chastota')}
              </label>
              <select
                value={draft.frequency}
                onChange={(e) => setDraft((d) => ({ ...d, frequency: e.target.value as ScheduledFrequency }))}
                style={{ width: '100%', border: '1px solid var(--sg-border)', borderRadius: 8, padding: '8px 10px' }}
              >
                {(Object.keys(frequencyLabel) as ScheduledFrequency[]).map((key) => (
                  <option key={key} value={key}>{frequencyLabel[key]}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="sg-btn ghost" onClick={() => setShowForm(false)}>{tr('Отмена', 'Bekor')}</button>
            <button className="sg-btn primary" onClick={() => void addSchedule()} disabled={saving}>
              {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
            </button>
          </div>
        </div>
      )}

      {schedules.length === 0 && !showForm ? (
        <p className="sg-subtitle">{tr('Нет запланированных отчётов', 'Rejalashtirilgan hisobotlar yo`q')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loadError && (
            <p className="sg-subtitle" style={{ color: '#b91c1c' }}>{tr('Не удалось загрузить расписания', 'Jadvallarni yuklab bo`lmadi')}</p>
          )}
          {schedules.map((s) => (
            <div key={s.id} className="sg-card soft" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{reportTypeLabel[s.reportType] || s.reportType}</span>
                <span className="sg-subtitle" style={{ marginLeft: 10 }}>
                  {frequencyLabel[s.frequency]} · {s.periodDays} {tr('дней', 'kun')}
                </span>
                {s.nextRunAt && (
                  <span className="sg-subtitle" style={{ marginLeft: 10, fontSize: 11 }}>
                    {tr('Следующая', 'Keyingisi')}: {new Date(s.nextRunAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <button
                className="sg-btn ghost"
                style={{ fontSize: 12, padding: '4px 10px', color: '#b91c1c' }}
                onClick={() => void removeSchedule(s.id)}
              >
                {tr('Удалить', "O'chirish")}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Reports() {
  const { tr } = useAdminI18n();
  const [period, setPeriod] = useState(30);
  const [meta, setMeta] = useState<ReportsMeta | null>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const nextMeta = await adminApi.getReportsMeta();
        if (cancelled) return;
        setMeta(nextMeta);

        const access = nextMeta?.reportAccess || {};
        const calls: Promise<void>[] = [];

        calls.push(
          adminApi.getTopProducts(period).then((data) => {
            if (!cancelled) setTopProducts(Array.isArray(data) ? data : []);
          })
        );

        if (access.advanced) {
          calls.push(
            adminApi.getRevenue(period).then((data) => {
              if (!cancelled) setRevenue(Array.isArray(data) ? data : []);
            })
          );
          calls.push(
            adminApi.getCategoryReport(period).then((data) => {
              if (!cancelled) setCategories(Array.isArray(data) ? data : []);
            })
          );
        } else {
          setRevenue([]);
          setCategories([]);
        }

        if (access.full) {
          calls.push(
            adminApi.getCustomersReport(period, 30).then((data) => {
              if (!cancelled) setCustomers(Array.isArray(data) ? data : []);
            })
          );
        } else {
          setCustomers([]);
        }

        await Promise.all(calls);
      } catch (err: any) {
        if (!cancelled) showNotice('error', err?.message || tr('Не удалось загрузить отчеты', 'Hisobotlarni yuklab bo`lmadi'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const limits = meta?.reportLimits;
  const access = meta?.reportAccess || {};
  const usage = meta?.usage;

  const revenueTotal = useMemo(
    () => revenue.reduce((sum, row) => sum + Number(row?.revenue || 0), 0),
    [revenue]
  );

  const reportLevelLabel = useMemo(() => {
    if (limits?.reportsLevel === 'FULL') return tr('Все отчеты', 'Barcha hisobotlar');
    if (limits?.reportsLevel === 'ADVANCED') return tr('Базовые + расширенные', 'Oddiy + kengaytirilgan');
    return tr('Базовые', 'Oddiy');
  }, [limits?.reportsLevel, tr]);

  const exportLeftLabel = useMemo(() => {
    if ((usage?.exportsLeft ?? 0) < 0) return tr('Без лимита', 'Cheklanmagan');
    return String(usage?.exportsLeft ?? 0);
  }, [usage?.exportsLeft, tr]);

  const doExport = async (type: string) => {
    try {
      setExporting(type);
      await adminApi.downloadReportCsv(type, period);
      const refreshed = await adminApi.getReportsMeta();
      setMeta(refreshed);
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430 \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0430', 'Eksport xatosi'));
    } finally {
      setExporting(null);
    }
  };

  const noticeNode = notice ? (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 200, minWidth: 260, maxWidth: 420,
      borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 700,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', animation: 'sg-fade-in 0.2s ease both',
      color: notice.tone === 'error' ? '#991b1b' : '#065f46',
      background: notice.tone === 'error' ? '#fee2e2' : '#d1fae5',
      border: `1px solid ${notice.tone === 'error' ? '#fecaca' : '#a7f3d0'}`,
    }}>
      {notice.message}
    </div>
  ) : null;

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sg-title">{tr('Отчеты', 'Hisobotlar')}</h2>
          <p className="sg-subtitle">{tr('Сводка продаж по уровню вашего тарифа', 'Tarif darajangiz bo`yicha savdo hisobotlari')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="sg-kpi-label">{tr('Период', 'Davr')}</span>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ minWidth: 140 }}>
            {[7, 14, 30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>{d} {tr('дней', 'kun')}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="sg-grid cols-4">
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Текущий план', 'Joriy tarif')}</div>
          <div className="sg-kpi-value">{limits?.planCode || '-'}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Уровень отчетов', 'Hisobot darajasi')}</div>
          <div className="sg-kpi-value" style={{ fontSize: 24 }}>{reportLevelLabel}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('История', 'Tarix')}</div>
          <div className="sg-kpi-value">{limits?.reportsHistoryDays ?? '-'} {tr('дней', 'kun')}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Экспорт в месяц', 'Oyiga eksport')}</div>
          <div className="sg-kpi-value">{exportLeftLabel}</div>
          <div className="sg-subtitle">{tr('Использовано', 'Ishlatilgan')}: {usage?.exportsThisMonth ?? 0}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Авто-рассылок', "Avtomatik hisobotlar")}</div>
          <div className="sg-kpi-value">
            {limits?.maxScheduledReports === -1
              ? tr('Без лимита', 'Cheksiz')
              : (limits?.maxScheduledReports ?? 0)}
          </div>
          <div className="sg-subtitle">{tr('Плановых отчётов', 'Rejalashtirilgan')}</div>
        </article>
      </div>

      {loading ? (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 16, padding: '12px 16px', borderBottom: '1px solid #edf2ee', alignItems: 'center' }}>
              <div className="sg-skeleton" style={{ height: 14, flex: 2 }} />
              <div className="sg-skeleton" style={{ height: 14, flex: 1 }} />
              <div className="sg-skeleton" style={{ height: 14, width: 80 }} />
              <div className="sg-skeleton" style={{ height: 14, width: 60 }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <section className="sg-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Базовые отчеты', 'Oddiy hisobotlar')}</h3>
                <p className="sg-subtitle" style={{ marginBottom: 10 }}>{tr('Топ товаров по выручке', 'Tushum bo`yicha top mahsulotlar')}</p>
              </div>
              {access.export && (
                <button className="sg-btn ghost" disabled={exporting === 'top-products'} onClick={() => doExport('top-products')}>
                  {exporting === 'top-products' ? '...' : tr('Экспорт CSV', 'CSV eksport')}
                </button>
              )}
            </div>
            {topProducts.length === 0 ? (
              <p className="sg-subtitle">{tr('Нет данных за выбранный период', 'Tanlangan davrda ma`lumot yo`q')}</p>
            ) : (
              <table className="sg-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{tr('Товар', 'Mahsulot')}</th>
                    <th>{tr('Кол-во', 'Soni')}</th>
                    <th>{tr('Выручка', 'Tushum')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.slice(0, 10).map((row: any, idx: number) => (
                    <tr key={`${row?.productId || idx}`}>
                      <td>{idx + 1}</td>
                      <td>{row?.productName || '-'}</td>
                      <td>{Number(row?.totalQty || 0)}</td>
                      <td>{Number(row?.totalRevenue || 0).toLocaleString()} UZS</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="sg-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Расширенные отчеты (PRO)', 'Kengaytirilgan hisobotlar (PRO)')}</h3>
              {access.advanced && access.export && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="sg-btn ghost" disabled={exporting === 'revenue'} onClick={() => doExport('revenue')}>
                    {exporting === 'revenue' ? '...' : tr('Выручка CSV', 'Tushum CSV')}
                  </button>
                  <button className="sg-btn ghost" disabled={exporting === 'categories'} onClick={() => doExport('categories')}>
                    {exporting === 'categories' ? '...' : tr('Категории CSV', 'Toifalar CSV')}
                  </button>
                </div>
              )}
            </div>
            {!access.advanced ? (
              <div style={{ marginTop: 10, padding: '20px 16px', background: 'var(--sg-panel-2)', border: '1px solid var(--sg-border)', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{tr('Доступно на PRO и BUSINESS', 'PRO va BUSINESS tariflarida mavjud')}</p>
                <p className="sg-subtitle" style={{ marginTop: 4 }}>{tr('Выручка по дням и отчёт по категориям', 'Kunlik tushum va toifalar hisoboti')}</p>
                <button className="sg-btn primary" style={{ marginTop: 12 }} onClick={() => (window.location.hash = '/billing')}>
                  {tr('Перейти к тарифам', 'Tariflarga o\'tish')}
                </button>
              </div>
            ) : (
              <div className="sg-grid cols-2" style={{ marginTop: 10 }}>
                <div className="sg-card soft">
                  <div className="sg-kpi-label">{tr('Выручка за период', 'Davr bo`yicha tushum')}</div>
                  <div className="sg-kpi-value">{revenueTotal.toLocaleString()} UZS</div>
                  <div className="sg-subtitle">{tr('Дней с продажами', 'Savdo bo`lgan kunlar')}: {revenue.length}</div>
                </div>
                <div className="sg-card soft">
                  <div className="sg-kpi-label">{tr('Категории с продажами', 'Savdo bo`lgan toifalar')}</div>
                  <div className="sg-kpi-value">{categories.length}</div>
                </div>
              </div>
            )}

            {access.advanced && (
              <table className="sg-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>{tr('Категория', 'Toifa')}</th>
                    <th>{tr('Кол-во', 'Soni')}</th>
                    <th>{tr('Выручка', 'Tushum')}</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.slice(0, 10).map((row: any) => (
                    <tr key={row?.categoryId || row?.categoryName}>
                      <td>{row?.categoryName || '-'}</td>
                      <td>{Number(row?.totalQty || 0)}</td>
                      <td>{Number(row?.totalRevenue || 0).toLocaleString()} UZS</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="sg-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Полные отчеты (BUSINESS)', 'To`liq hisobotlar (BUSINESS)')}</h3>
              {access.full && access.export && (
                <button className="sg-btn ghost" disabled={exporting === 'customers'} onClick={() => doExport('customers')}>
                  {exporting === 'customers' ? '...' : tr('Клиенты CSV', 'Mijozlar CSV')}
                </button>
              )}
            </div>
            {!access.full ? (
              <div style={{ marginTop: 10, padding: '20px 16px', background: 'var(--sg-panel-2)', border: '1px solid var(--sg-border)', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{tr('Доступно только на BUSINESS', 'Faqat BUSINESS tarifida mavjud')}</p>
                <p className="sg-subtitle" style={{ marginTop: 4 }}>{tr('Аналитика по клиентам, LTV и сегментация', 'Mijozlar analitikasi, LTV va segmentatsiya')}</p>
                <button className="sg-btn primary" style={{ marginTop: 12 }} onClick={() => (window.location.hash = '/billing')}>
                  {tr('Обновить тариф', 'Tarifni yangilash')}
                </button>
              </div>
            ) : (
              <table className="sg-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>{tr('Клиент', 'Mijoz')}</th>
                    <th>{tr('Заказов', 'Buyurtmalar')}</th>
                    <th>{tr('Потрачено', 'Sarflagan')}</th>
                    <th>{tr('Баллы', 'Ball')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.slice(0, 20).map((row: any) => (
                    <tr key={row?.id}>
                      <td>{row?.displayName || '-'}</td>
                      <td>{Number(row?.ordersCount || 0)}</td>
                      <td>{Number(row?.totalSpent || 0).toLocaleString()} UZS</td>
                      <td>{Number(row?.loyaltyPoints || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <ScheduledReportsSection limits={limits} tr={tr} />
        </>
      )}
    </section>
  );
}
