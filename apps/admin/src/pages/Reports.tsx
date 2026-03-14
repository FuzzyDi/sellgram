import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

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
      alert(err?.message || tr('Ошибка экспорта', 'Eksport xatosi'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
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
      </div>

      {loading ? (
        <div className="sg-card"><p className="sg-subtitle">{tr('Загрузка...', 'Yuklanmoqda...')}</p></div>
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
              <div className="sg-card soft" style={{ marginTop: 10 }}>
                <p style={{ margin: 0 }}>{tr('Доступно на тарифах PRO и BUSINESS.', 'PRO va BUSINESS tariflarida mavjud.')}</p>
                <button className="sg-btn primary" style={{ marginTop: 10 }} onClick={() => (window.location.hash = '/billing')}>
                  {tr('Перейти к тарифам', 'Tariflarga o`tish')}
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
              <div className="sg-card soft" style={{ marginTop: 10 }}>
                <p style={{ margin: 0 }}>{tr('Доступно только на тарифе BUSINESS.', 'Faqat BUSINESS tarifida mavjud.')}</p>
                <button className="sg-btn primary" style={{ marginTop: 10 }} onClick={() => (window.location.hash = '/billing')}>
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
        </>
      )}
    </section>
  );
}
