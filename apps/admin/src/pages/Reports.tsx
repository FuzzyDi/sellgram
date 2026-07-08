import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Select from '../components/Select';
import Table, { type TableColumn } from '../components/Table';
import ScheduledReportsSection from './reports/ScheduledReportsSection';
import RevenueChart from './reports/RevenueChart';
import NewCustomersChart from './reports/NewCustomersChart';
import CategoryBarChart from './reports/CategoryBarChart';

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

export default function Reports() {
  const { tr } = useAdminI18n();
  const navigate = useNavigate();
  const [period, setPeriod] = useState(30);
  const [meta, setMeta] = useState<ReportsMeta | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [newCustomersSeries, setNewCustomersSeries] = useState<any[]>([]);
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
          adminApi.getAnalyticsSummary(period).then((data) => {
            if (!cancelled) setSummary(data ?? null);
          }).catch(() => {})
        );

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
          calls.push(
            adminApi.getNewCustomersSeries(period).then((data) => {
              if (!cancelled) setNewCustomersSeries(Array.isArray(data) ? data : []);
            }).catch(() => {})
          );
        } else {
          setRevenue([]);
          setCategories([]);
          setNewCustomersSeries([]);
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
      showNotice('error', err?.message || tr('Ошибка экспорта', 'Eksport xatosi'));
    } finally {
      setExporting(null);
    }
  };

  const noticeNode = notice ? (
    <div
      className={[
        'fixed top-4 right-4 z-[200] min-w-[260px] max-w-[420px] rounded-token-lg px-4 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30',
      ].join(' ')}
    >
      {notice.message}
    </div>
  ) : null;

  const topProductsColumns: TableColumn<any>[] = [
    { key: 'idx', header: '#', width: 36, render: (row) => row.__idx + 1 },
    { key: 'name', header: tr('Товар', 'Mahsulot'), render: (row) => row?.productName || '-' },
    { key: 'qty', header: tr('Кол-во', 'Soni'), render: (row) => Number(row?.totalQty || 0) },
    { key: 'revenue', header: tr('Выручка', 'Tushum'), render: (row) => `${Number(row?.totalRevenue || 0).toLocaleString()} UZS` },
  ];

  const categoriesColumns: TableColumn<any>[] = [
    { key: 'name', header: tr('Категория', 'Toifa'), render: (row) => row?.categoryName || '-' },
    { key: 'qty', header: tr('Кол-во', 'Soni'), render: (row) => Number(row?.totalQty || 0) },
    { key: 'revenue', header: tr('Выручка', 'Tushum'), render: (row) => `${Number(row?.totalRevenue || 0).toLocaleString()} UZS` },
  ];

  const customersColumns: TableColumn<any>[] = [
    { key: 'name', header: tr('Клиент', 'Mijoz'), render: (row) => row?.displayName || '-' },
    { key: 'orders', header: tr('Заказов', 'Buyurtmalar'), render: (row) => Number(row?.ordersCount || 0) },
    { key: 'spent', header: tr('Потрачено', 'Sarflagan'), render: (row) => `${Number(row?.totalSpent || 0).toLocaleString()} UZS` },
    { key: 'points', header: tr('Баллы', 'Ball'), render: (row) => Number(row?.loyaltyPoints || 0) },
  ];

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Отчеты', 'Hisobotlar')}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">{tr('Сводка продаж по уровню вашего тарифа', 'Tarif darajangiz bo`yicha savdo hisobotlari')}</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-token-xs text-neutral-500">{tr('Период', 'Davr')}</span>
          <div className="w-40">
            <Select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>{d} {tr('дней', 'kun')}</option>
              ))}
            </Select>
          </div>
        </div>
      </header>

      {/* Period KPI summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {[
            { label: tr('Заказов за период', 'Davrda buyurtmalar'), value: summary.ordersCount, sub: `${tr('завершено', 'yakunlandi')}: ${summary.completedCount}` },
            { label: tr('Выручка', 'Tushum'), value: `${Number(summary.revenue).toLocaleString()} UZS`, sub: `${summary.days} ${tr('дней', 'kun')}` },
            { label: tr('Средний чек', "O'rtacha chek"), value: `${Number(summary.avgCheck).toLocaleString()} UZS`, sub: tr('по завершённым', 'yakunlanganlarga') },
            { label: tr('Новых клиентов', 'Yangi mijozlar'), value: summary.newCustomers, sub: tr('за период', 'davr uchun') },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <div className="text-token-xs text-neutral-500">{kpi.label}</div>
              <div className={`font-semibold text-neutral-800 mt-1.5 ${typeof kpi.value === 'string' && kpi.value.length > 12 ? 'text-token-xl' : 'text-token-2xl'}`}>{kpi.value}</div>
              <div className="mt-0.5 text-token-xs text-neutral-500">{kpi.sub}</div>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Текущий план', 'Joriy tarif')}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{limits?.planCode || '-'}</div>
        </Card>
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Уровень отчетов', 'Hisobot darajasi')}</div>
          <div className="text-token-xl font-semibold text-neutral-800 mt-1.5">{reportLevelLabel}</div>
        </Card>
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('История', 'Tarix')}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{limits?.reportsHistoryDays ?? '-'} {tr('дней', 'kun')}</div>
        </Card>
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Экспорт в месяц', 'Oyiga eksport')}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{exportLeftLabel}</div>
          <div className="mt-0.5 text-token-xs text-neutral-500">{tr('Использовано', 'Ishlatilgan')}: {usage?.exportsThisMonth ?? 0}</div>
        </Card>
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Авто-рассылок', "Avtomatik hisobotlar")}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">
            {limits?.maxScheduledReports === -1
              ? tr('Без лимита', 'Cheksiz')
              : (limits?.maxScheduledReports ?? 0)}
          </div>
          <div className="mt-0.5 text-token-xs text-neutral-500">{tr('Плановых отчётов', 'Rejalashtirilgan')}</div>
        </Card>
      </div>

      {loading ? (
        <Card style={{ padding: 0 }} className="overflow-hidden">
          <div className="divide-y divide-neutral-200">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4 px-4 py-3 items-center">
                <div className="h-3.5 rounded-token-sm bg-neutral-100 animate-pulse" style={{ flex: 2 }} />
                <div className="h-3.5 rounded-token-sm bg-neutral-100 animate-pulse" style={{ flex: 1 }} />
                <div className="h-3.5 w-20 rounded-token-sm bg-neutral-100 animate-pulse" />
                <div className="h-3.5 w-14 rounded-token-sm bg-neutral-100 animate-pulse" />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex justify-between gap-2.5 items-center">
              <div>
                <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Базовые отчеты', 'Oddiy hisobotlar')}</h3>
                <p className="mt-1 mb-2.5 text-token-sm text-neutral-500">{tr('Топ товаров по выручке', 'Tushum bo`yicha top mahsulotlar')}</p>
              </div>
              {access.export && (
                <Button variant="ghost" size="md" type="button" disabled={exporting === 'top-products'} onClick={() => doExport('top-products')}>
                  {exporting === 'top-products' ? '...' : tr('Экспорт CSV', 'CSV eksport')}
                </Button>
              )}
            </div>
            {topProducts.length === 0 ? (
              <p className="text-token-sm text-neutral-500">{tr('Нет данных за выбранный период', 'Tanlangan davrda ma`lumot yo`q')}</p>
            ) : (
              <Table
                columns={topProductsColumns}
                data={topProducts.slice(0, 10).map((row, idx) => ({ ...row, __idx: idx }))}
                rowKey={(row) => String(row?.productId ?? row.__idx)}
              />
            )}
          </Card>

          <Card>
            <div className="flex justify-between gap-2.5 items-center">
              <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Расширенные отчеты (PRO)', 'Kengaytirilgan hisobotlar (PRO)')}</h3>
              {access.advanced && access.export && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="md" type="button" disabled={exporting === 'revenue'} onClick={() => doExport('revenue')}>
                    {exporting === 'revenue' ? '...' : tr('Выручка CSV', 'Tushum CSV')}
                  </Button>
                  <Button variant="ghost" size="md" type="button" disabled={exporting === 'categories'} onClick={() => doExport('categories')}>
                    {exporting === 'categories' ? '...' : tr('Категории CSV', 'Toifalar CSV')}
                  </Button>
                </div>
              )}
            </div>
            {!access.advanced ? (
              <div className="mt-2.5 py-5 px-4 bg-neutral-50 border border-neutral-200 rounded-token-lg text-center">
                <div className="text-token-2xl mb-2">🔒</div>
                <p className="m-0 font-semibold text-token-base text-neutral-800">{tr('Доступно на PRO и BUSINESS', 'PRO va BUSINESS tariflarida mavjud')}</p>
                <p className="mt-1 text-token-sm text-neutral-500">{tr('Выручка по дням и отчёт по категориям', 'Kunlik tushum va toifalar hisoboti')}</p>
                <Button variant="primary" size="md" type="button" className="mt-3" onClick={() => navigate('/billing')}>
                  {tr('Перейти к тарифам', 'Tariflarga o\'tish')}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2.5">
                <Card className="bg-neutral-50">
                  <div className="text-token-xs text-neutral-500">{tr('Выручка за период', 'Davr bo`yicha tushum')}</div>
                  <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{revenueTotal.toLocaleString()} UZS</div>
                  <div className="mt-0.5 text-token-xs text-neutral-500">{tr('Дней с продажами', 'Savdo bo`lgan kunlar')}: {revenue.length}</div>
                </Card>
                <Card className="bg-neutral-50">
                  <div className="text-token-xs text-neutral-500">{tr('Категории с продажами', 'Savdo bo`lgan toifalar')}</div>
                  <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{categories.length}</div>
                </Card>
              </div>
            )}

            {access.advanced && revenue.length > 1 && (
              <div className="mt-3.5">
                <div className="text-token-xs text-neutral-500 mb-1.5">{tr('Выручка по дням', 'Kunlik tushum')}</div>
                <RevenueChart data={revenue} />
              </div>
            )}

            {access.advanced && newCustomersSeries.some((d) => d.count > 0) && (
              <div className="mt-3.5">
                <div className="text-token-xs text-neutral-500 mb-1.5">{tr('Новые клиенты по дням', 'Kunlik yangi mijozlar')}</div>
                <NewCustomersChart data={newCustomersSeries} />
              </div>
            )}

            {access.advanced && categories.length > 0 && (
              <div className="mt-3.5">
                <div className="text-token-xs text-neutral-500 mb-2">{tr('Выручка по категориям', 'Toifalar bo`yicha tushum')}</div>
                <CategoryBarChart data={categories.slice(0, 10)} />
              </div>
            )}

            {access.advanced && (
              <div className="mt-3.5">
                <Table columns={categoriesColumns} data={categories.slice(0, 10)} rowKey={(row) => String(row?.categoryId ?? row?.categoryName)} />
              </div>
            )}
          </Card>

          <Card>
            <div className="flex justify-between gap-2.5 items-center">
              <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Полные отчеты (BUSINESS)', 'To`liq hisobotlar (BUSINESS)')}</h3>
              {access.full && access.export && (
                <Button variant="ghost" size="md" type="button" disabled={exporting === 'customers'} onClick={() => doExport('customers')}>
                  {exporting === 'customers' ? '...' : tr('Клиенты CSV', 'Mijozlar CSV')}
                </Button>
              )}
            </div>
            {!access.full ? (
              <div className="mt-2.5 py-5 px-4 bg-neutral-50 border border-neutral-200 rounded-token-lg text-center">
                <div className="text-token-2xl mb-2">🔒</div>
                <p className="m-0 font-semibold text-token-base text-neutral-800">{tr('Доступно только на BUSINESS', 'Faqat BUSINESS tarifida mavjud')}</p>
                <p className="mt-1 text-token-sm text-neutral-500">{tr('Аналитика по клиентам, LTV и сегментация', 'Mijozlar analitikasi, LTV va segmentatsiya')}</p>
                <Button variant="primary" size="md" type="button" className="mt-3" onClick={() => navigate('/billing')}>
                  {tr('Обновить тариф', 'Tarifni yangilash')}
                </Button>
              </div>
            ) : (
              <div className="mt-2.5">
                <Table columns={customersColumns} data={customers.slice(0, 20)} rowKey={(row) => String(row?.id)} />
              </div>
            )}
          </Card>

          <ScheduledReportsSection limits={limits} tr={tr} />
        </>
      )}
    </section>
  );
}
