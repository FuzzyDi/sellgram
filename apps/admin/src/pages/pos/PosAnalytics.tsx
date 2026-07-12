import React, { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Select from '../../components/Select';
import Input from '../../components/Input';
import Table, { type TableColumn } from '../../components/Table';
import {
  usePosStores, isPlanBlockedError, PosPlanBlocked, PosSubNav, PosStoreSelect,
} from './pos-shared';

type NoticeTone = 'success' | 'error';
type Period = 'today' | 'week' | 'month' | 'custom';

// FiscalEvent.totalAmount is stored in tiyin (1/100 UZS) — every money
// figure from GET /pos-analytics needs this conversion before display,
// same as the receipt detail view in PosReceipts.tsx would if it showed
// a converted total (there it deliberately shows the raw stored value
// instead, since that screen is a raw-data inspector).
function formatUzs(tiyin: number): string {
  return `${Math.round((tiyin || 0) / 100).toLocaleString('ru-RU')} UZS`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PosAnalytics() {
  const { tr } = useAdminI18n();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [period, setPeriod] = useState<Period>('today');
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const loadAnalytics = useCallback(async (targetStoreId: string) => {
    if (!targetStoreId) return;
    if (period === 'custom' && (!from || !to)) return;
    setLoading(true);
    try {
      const result = await adminApi.getPosAnalytics({
        storeId: targetStoreId,
        period,
        from: period === 'custom' ? from : undefined,
        to: period === 'custom' ? to : undefined,
      });
      setData(result);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить аналитику', "Analitikani yuklab bo'lmadi"));
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tr, period, from, to]);

  useEffect(() => {
    if (storeId) void loadAnalytics(storeId);
  }, [storeId, loadAnalytics]);

  const byDayChartData = (data?.byDay || []).map((d: any) => ({ ...d, label: d.date.slice(5) }));
  const byPaymentChartData = (data?.byPayment || []).map((p: any) => ({ ...p, amountUzs: Math.round((p.amount || 0) / 100) }));

  const topProductsColumns: TableColumn<any>[] = [
    { key: 'name', header: tr('Товар', 'Mahsulot'), render: (row) => row.name },
    { key: 'qty', header: tr('Кол-во', 'Soni'), align: 'right', render: (row) => row.qty.toLocaleString('ru-RU') },
    { key: 'amount', header: tr('Сумма', 'Summa'), align: 'right', render: (row) => formatUzs(row.amount) },
  ];

  const noticeNode = notice ? (
    <div
      className={[
        'fixed top-[18px] right-[18px] z-[70] min-w-[280px] max-w-[440px] rounded-token-lg px-3.5 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  if (storesLoading) {
    return (
      <section className="flex flex-col gap-4">
        <div className="h-7 w-[35%] rounded-token-sm bg-neutral-100 animate-pulse" />
        <div className="h-32 rounded-token-lg bg-neutral-100 animate-pulse" />
      </section>
    );
  }

  if (storesError || stores.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <PosHeader tr={tr} />
        <PosSubNav />
        <Card className="text-center py-8 px-4">
          <p className="text-token-sm text-neutral-500">
            {tr('Сначала создайте магазин в настройках.', "Avval sozlamalarda do'kon yarating.")}
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <PosHeader tr={tr} />
      <PosSubNav />

      <PosStoreSelect stores={stores} storeId={storeId} onChange={selectStore} />

      {planBlocked ? (
        <PosPlanBlocked />
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <Select
                label={tr('Период', 'Davr')}
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
              >
                <option value="today">{tr('Сегодня', 'Bugun')}</option>
                <option value="week">{tr('Неделя', 'Hafta')}</option>
                <option value="month">{tr('Месяц', 'Oy')}</option>
                <option value="custom">{tr('Произвольный', 'Ixtiyoriy')}</option>
              </Select>
              {period === 'custom' && (
                <>
                  <Input label={tr('С', 'Dan')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} />
                  <Input label={tr('По', 'Gacha')} type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} max={todayIso()} />
                </>
              )}
            </div>
          </Card>

          {loading || !data ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <div className="h-3.5 w-3/5 rounded-token-sm bg-neutral-100 animate-pulse" />
                  <div className="h-7 w-1/2 rounded-token-sm bg-neutral-100 animate-pulse mt-2" />
                </Card>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card>
                  <div className="text-token-xs text-neutral-500">{tr('Выручка', 'Tushum')}</div>
                  <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{formatUzs(data.receipts.totalAmount)}</div>
                </Card>
                <Card>
                  <div className="text-token-xs text-neutral-500">{tr('Чеков', 'Cheklar')}</div>
                  <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{data.receipts.total.toLocaleString('ru-RU')}</div>
                </Card>
                <Card>
                  <div className="text-token-xs text-neutral-500">{tr('Средний чек', "O'rtacha chek")}</div>
                  <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{formatUzs(data.receipts.avgAmount)}</div>
                </Card>
                <Card>
                  <div className="text-token-xs text-neutral-500">{tr('Смен', 'Smenalar')}</div>
                  <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{data.shifts.completed.toLocaleString('ru-RU')}</div>
                </Card>
              </div>

              <Card>
                <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Выручка по дням', 'Kunlik tushum')}</h3>
                {byDayChartData.length === 0 || byDayChartData.every((d: any) => d.amount === 0) ? (
                  <p className="mt-2 text-token-sm text-neutral-500">{tr('Данных пока нет', "Hozircha ma'lumot yo'q")}</p>
                ) : (
                  <div className="mt-3" style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                      <AreaChart data={byDayChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="pos-rev-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00875a" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#00875a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="label" fontSize={11} stroke="#9ca3af" tickLine={false} axisLine={false} />
                        <YAxis
                          fontSize={11}
                          stroke="#9ca3af"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => Math.round(v / 100).toLocaleString('ru-RU')}
                        />
                        <Tooltip formatter={(v: number) => formatUzs(Number(v))} labelFormatter={(l) => l} />
                        <Area type="monotone" dataKey="amount" stroke="#00875a" strokeWidth={2} fill="url(#pos-rev-grad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card>
                <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('По способам оплаты', "To'lov turlari bo'yicha")}</h3>
                {byPaymentChartData.length === 0 ? (
                  <p className="mt-2 text-token-sm text-neutral-500">{tr('Данных пока нет', "Hozircha ma'lumot yo'q")}</p>
                ) : (
                  <div className="mt-3" style={{ width: '100%', height: Math.max(120, byPaymentChartData.length * 44) }}>
                    <ResponsiveContainer>
                      <BarChart data={byPaymentChartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" fontSize={11} stroke="#9ca3af" tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toLocaleString('ru-RU')} />
                        <YAxis type="category" dataKey="method" fontSize={11} stroke="#9ca3af" tickLine={false} axisLine={false} width={90} />
                        <Tooltip formatter={(v: number) => `${Number(v).toLocaleString('ru-RU')} UZS`} />
                        <Bar dataKey="amountUzs" fill="#00875a" fillOpacity={0.75} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card>
                <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Топ 5 товаров', 'Top 5 mahsulot')}</h3>
                <p className="mt-1 mb-2.5 text-token-sm text-neutral-500">{tr('По количеству продаж', "Sotuvlar soni bo'yicha")}</p>
                {(data.topProducts || []).length === 0 ? (
                  <p className="text-token-sm text-neutral-500">{tr('Данных пока нет', "Hozircha ma'lumot yo'q")}</p>
                ) : (
                  <Table
                    columns={topProductsColumns}
                    data={data.topProducts.slice(0, 5)}
                    rowKey={(row) => row.name}
                  />
                )}
              </Card>
            </>
          )}
        </>
      )}
    </section>
  );
}

function PosHeader({ tr }: { tr: (ru: string, uz: string) => string }) {
  return (
    <header className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-token-2xl font-semibold text-neutral-800 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-channel-pos" aria-hidden="true" />
          POS · {tr('Аналитика', 'Analitika')}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr('Выручка, чеки и смены кассовых устройств', "Kassa qurilmalarining tushumi, cheklari va smenalari")}
        </p>
      </div>
    </header>
  );
}
