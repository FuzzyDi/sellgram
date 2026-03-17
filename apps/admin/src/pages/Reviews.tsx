import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} style={{ fontSize: size, color: s <= rating ? '#f59e0b' : '#d1d5db' }}>★</span>
      ))}
    </span>
  );
}

function DistributionBar({ dist, total }: { dist: Record<number, number>; total: number }) {
  const { tr } = useAdminI18n();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {[5, 4, 3, 2, 1].map((star) => {
        const count = dist[star] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, color: '#6b7280', textAlign: 'right' }}>{star}</span>
            <span style={{ color: '#f59e0b', fontSize: 13 }}>★</span>
            <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#f59e0b', borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
            <span style={{ width: 28, color: '#6b7280', textAlign: 'right' }}>{count}</span>
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

  const load = useCallback(async (p = page) => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (ratingFilter) params.set('rating', ratingFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await adminApi.getReviews(params.toString());
      setData(res.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, ratingFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [ratingFilter, dateFrom, dateTo]);
  useEffect(() => { load(page); }, [page, ratingFilter, dateFrom, dateTo]);

  const stats = data?.stats;
  const items: any[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>
        {tr('Отзывы', 'Sharhlar')}
      </h2>
      <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>
        {tr('Оценки клиентов после получения заказов', "Buyurtmalardan so'ng mijozlar reytingi")}
      </p>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 24 }}>
          <div className="sg-card" style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: '#111', lineHeight: 1 }}>
              {stats.avg ?? '—'}
            </div>
            <div style={{ margin: '8px 0 4px' }}>
              <Stars rating={Math.round(stats.avg ?? 0)} size={20} />
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {total} {tr('отзывов', 'sharh')}
            </div>
          </div>
          <div className="sg-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
              {tr('Распределение', 'Taqsimot')}
            </div>
            <DistributionBar dist={stats.distribution} total={total} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          className="sg-input"
          style={{ width: 140 }}
        >
          <option value="">{tr('Все оценки', 'Barcha reytinglar')}</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>{'★'.repeat(r)} ({r})</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="sg-input"
          style={{ width: 150 }}
          placeholder={tr('Дата от', 'Sanadan')}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="sg-input"
          style={{ width: 150 }}
          placeholder={tr('Дата до', 'Sanagacha')}
        />
        {(ratingFilter || dateFrom || dateTo) && (
          <button
            className="sg-btn sg-btn-ghost"
            onClick={() => { setRatingFilter(''); setDateFrom(''); setDateTo(''); }}
          >
            {tr('Сбросить', 'Tozalash')}
          </button>
        )}
      </div>

      {/* Error */}
      {loadError && (
        <div className="sg-card" style={{ padding: 32, textAlign: 'center', color: '#b91c1c' }}>
          <p style={{ margin: '0 0 12px' }}>{tr('Ошибка загрузки', 'Yuklashda xato')}</p>
          <button className="sg-btn sg-btn-primary" onClick={() => load(page)}>
            {tr('Повторить', 'Qayta urinish')}
          </button>
        </div>
      )}

      {/* Skeleton */}
      {loading && !loadError && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="sg-skeleton" style={{ height: 72, borderRadius: 12 }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !loadError && items.length === 0 && (
        <div className="sg-card" style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⭐</div>
          <p style={{ margin: 0 }}>{tr('Отзывов пока нет', 'Hali sharhlar yo\'q')}</p>
        </div>
      )}

      {/* List */}
      {!loading && !loadError && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item: any) => {
            const customer = item.order?.customer;
            const customerName = customer
              ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') || `@${customer.telegramUser}` || '—'
              : '—';
            return (
              <div
                key={item.id}
                className="sg-card"
                style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Stars rating={item.rating} size={16} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>
                    {tr('Заказ', 'Buyurtma')} #{item.order?.orderNumber}
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{customerName}</span>
                  {item.order?.store?.name && (
                    <span
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px',
                        borderRadius: 6, background: '#f0f9ff', color: '#0369a1',
                      }}
                    >
                      {item.order.store.name}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    {new Date(item.createdAt).toLocaleDateString(locale)}
                  </span>
                </div>
                {item.comment && (
                  <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    {item.comment}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button
            className="sg-btn sg-btn-ghost"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ←
          </button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: '#374151' }}>
            {page} / {totalPages}
          </span>
          <button
            className="sg-btn sg-btn-ghost"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
