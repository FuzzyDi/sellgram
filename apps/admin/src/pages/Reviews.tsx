import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Select from '../components/Select';
import Input from '../components/Input';

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex gap-px">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} style={{ fontSize: size }} className={s <= rating ? 'text-warning' : 'text-neutral-300'}>★</span>
      ))}
    </span>
  );
}

function DistributionBar({ dist, total }: { dist: Record<number, number>; total: number }) {
  return (
    <div className="flex flex-col gap-1">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = dist[star] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-token-xs">
            <span className="w-2.5 text-neutral-500 text-right">{star}</span>
            <span className="text-warning text-token-sm">★</span>
            <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
              <div className="h-full bg-warning rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-7 text-neutral-500 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Reviews() {
  const { tr, locale } = useAdminI18n();
  const [data, setData] = useState<any>(null);
  const [ratingFilter, setRatingFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (ratingFilter) params.set('rating', ratingFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('hidden', showHidden ? 'true' : 'false');
      const res = await adminApi.getReviews(params.toString());
      setData(res);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, ratingFilter, dateFrom, dateTo, showHidden]);

  const toggleHidden = async (id: string, currentlyHidden: boolean) => {
    setToggling(id);
    try {
      if (currentlyHidden) await adminApi.showReview(id);
      else await adminApi.hideReview(id);
      await load(page);
    } finally {
      setToggling(null);
    }
  };

  useEffect(() => { setPage(1); }, [ratingFilter, dateFrom, dateTo, showHidden]);
  useEffect(() => { load(page); }, [page, ratingFilter, dateFrom, dateTo, showHidden]);

  const stats = data?.stats;
  const items: any[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Отзывы', 'Sharhlar')}</h2>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Оценки клиентов после получения заказов', "Buyurtmalardan so'ng mijozlar reytingi")}</p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1.5">
        <Button variant={!showHidden ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => setShowHidden(false)}>
          {tr('Видимые', "Ko'rinadigan")}
        </Button>
        <Button variant={showHidden ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => setShowHidden(true)}>
          {tr('Скрытые', 'Yashirilgan')}
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Card className="text-center sm:col-span-1">
            <div className="text-token-2xl font-extrabold text-neutral-800" style={{ fontSize: 40 }}>{stats.avg ?? '—'}</div>
            <div className="my-2"><Stars rating={Math.round(stats.avg ?? 0)} size={20} /></div>
            <div className="text-token-sm text-neutral-500">{total} {tr('отзывов', 'sharh')}</div>
          </Card>
          <Card className="sm:col-span-2">
            <div className="text-token-sm font-semibold text-neutral-700 mb-3">{tr('Распределение', 'Taqsimot')}</div>
            <DistributionBar dist={stats.distribution} total={total} />
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2.5 flex-wrap items-end">
        <div className="w-[160px]">
          <Select label={tr('Оценка', 'Reyting')} value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)}>
            <option value="">{tr('Все оценки', 'Barcha reytinglar')}</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>{'★'.repeat(r)} ({r})</option>
            ))}
          </Select>
        </div>
        <div className="w-[160px]">
          <Input type="date" label={tr('Дата от', 'Sanadan')} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="w-[160px]">
          <Input type="date" label={tr('Дата до', 'Sanagacha')} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {(ratingFilter || dateFrom || dateTo) && (
          <Button variant="ghost" size="md" type="button" onClick={() => { setRatingFilter(''); setDateFrom(''); setDateTo(''); }}>
            {tr('Сбросить', 'Tozalash')}
          </Button>
        )}
      </div>

      {/* Error */}
      {loadError && (
        <Card className="text-center py-8 px-4">
          <p className="m-0 mb-3 text-danger">{tr('Ошибка загрузки', 'Yuklashda xato')}</p>
          <Button variant="primary" size="md" type="button" onClick={() => load(page)}>
            {tr('Повторить', 'Qayta urinish')}
          </Button>
        </Card>
      )}

      {/* Skeleton */}
      {loading && !loadError && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[72px] rounded-token-lg bg-neutral-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !loadError && items.length === 0 && (
        <Card className="text-center py-12 px-4">
          <div className="text-token-2xl mb-2">⭐</div>
          <p className="m-0 text-neutral-500">{tr('Отзывов пока нет', "Hali sharhlar yo'q")}</p>
        </Card>
      )}

      {/* List */}
      {!loading && !loadError && items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((item: any) => {
            const customer = item.order?.customer;
            const customerName = customer
              ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') || `@${customer.telegramUser}` || '—'
              : '—';
            return (
              <Card key={item.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <Stars rating={item.rating} size={16} />
                  <span className="font-semibold text-token-sm text-neutral-800">
                    {tr('Заказ', 'Buyurtma')} #{item.order?.orderNumber}
                  </span>
                  <span className="text-token-xs text-neutral-500">{customerName}</span>
                  {item.order?.store?.name && (
                    <span className="text-token-xs font-semibold px-2 py-0.5 rounded-token-sm bg-accent-600/10 text-accent-600">
                      {item.order.store.name}
                    </span>
                  )}
                  <span className="text-token-xs text-neutral-400 whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleDateString(locale)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className={`ml-auto ${item.hidden ? 'text-success' : 'text-danger'}`}
                    disabled={toggling === item.id}
                    onClick={() => toggleHidden(item.id, item.hidden)}
                  >
                    {toggling === item.id ? '...' : item.hidden ? tr('Показать', "Ko'rsatish") : tr('Скрыть', 'Yashirish')}
                  </Button>
                </div>
                {item.comment && (
                  <p className={`m-0 text-token-sm leading-relaxed ${item.hidden ? 'text-neutral-400' : 'text-neutral-700'}`}>
                    {item.comment}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-2">
          <Button variant="ghost" size="md" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ← {tr('Назад', 'Orqaga')}
          </Button>
          <span className="px-3.5 py-1.5 text-token-sm font-semibold text-neutral-700 bg-neutral-100 rounded-token-md min-w-[80px] text-center">
            {page} / {totalPages}
          </span>
          <Button variant="ghost" size="md" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            {tr('Далее', 'Keyingi')} →
          </Button>
        </div>
      )}
    </section>
  );
}
