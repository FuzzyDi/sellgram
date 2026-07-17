import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge, { type BadgeVariant } from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import {
  usePosStores, isPlanBlockedError, PosPlanBlocked, PosSubNav, PosStoreSelect,
} from './pos-shared';

type NoticeTone = 'success' | 'error';

const PAGE_SIZE = 25;

// docs/POS_SYNC_API.md §25 — applies to both `eventType` (PAYMENT_*/
// PAYMENT_REFUND_*/PROVIDER_REJECTED_CONFIRMED/RECOVERY_FAILED_RETRYABLE)
// and the plain `status` field (CONFIRMED/REJECTED/PENDING/CANCELLED/
// AMBIGUOUS) with the same substring rule, since both columns need a
// color and only four color buckets were specified. REJECTED is checked
// first so PROVIDER_REJECTED_CONFIRMED (contains both REJECTED and
// CONFIRMED) reads as danger, not success — not explicitly specified in
// the brief for this component, a judgment call flagged here rather than
// silently made. RECOVERY_FAILED_RETRYABLE and *_INITIATED aren't
// covered by the brief's four buckets either; failed→danger,
// initiated→falls through to the neutral default (nothing has gone
// wrong yet, nothing is confirmed yet).
function paymentBadgeVariant(value: string): BadgeVariant {
  const v = String(value || '').toUpperCase();
  if (v.includes('REJECTED') || v.includes('RECOVERY_FAILED')) return 'danger';
  if (v.includes('CONFIRMED')) return 'success';
  if (v.includes('PENDING') || v.includes('AMBIGUOUS')) return 'warning';
  if (v.includes('CANCELLED')) return 'neutral';
  return 'neutral';
}

// UZQR/PINPAD/PAYME/CLICK/QR_STATIC/BANK_TRANSFER/CASH
// (docs/POS_SYNC_API.md §25) — same color grouping as PosPaymentTerminals
// .tsx's typeBadgeVariant (CASH neutral, card-present info, QR success,
// bank transfer warning), adapted to this endpoint's own provider
// spellings rather than PaymentTerminal.type's (they're related but not
// identical — e.g. "PINPAD" here vs. "CARD_PINPAD" there).
function providerBadgeVariant(provider: string): BadgeVariant {
  const p = String(provider || '').toUpperCase();
  if (p === 'CASH') return 'neutral';
  if (p === 'PINPAD') return 'info';
  if (p.includes('QR') || p === 'PAYME' || p === 'CLICK') return 'success';
  if (p === 'BANK_TRANSFER') return 'warning';
  return 'neutral';
}

function PaymentEventDetailModal({ event, onClose, locale, tr }: {
  event: any; onClose: () => void; locale: string; tr: (ru: string, uz: string) => string;
}) {
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 mb-1 text-token-base font-semibold text-neutral-800 flex items-center gap-2">
          <Badge variant={paymentBadgeVariant(event.eventType)}>{event.eventType}</Badge>
          <Badge variant={providerBadgeVariant(event.provider)}>{event.provider}</Badge>
        </h3>
        <p className="text-token-xs text-neutral-500 mb-3">
          {new Date(event.createdAt).toLocaleString(locale)} · {event.device?.name || '—'} · {event.aggregateId}
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3 text-token-sm">
          <div>
            <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              {tr('Сумма', 'Summa')}
            </div>
            <div className="text-neutral-800 font-semibold">{Number(event.amount).toLocaleString()} {event.currency}</div>
          </div>
          <div>
            <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              {tr('Операция', 'Amaliyot')}
            </div>
            <div className="text-neutral-800">{event.operation}</div>
          </div>
          <div>
            <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              {tr('Кассир', 'Kassir')}
            </div>
            <div className="text-neutral-800">{event.cashierName || event.cashierId || '—'}</div>
          </div>
          <div>
            <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              {tr('Статус', 'Holat')}
            </div>
            <Badge variant={paymentBadgeVariant(event.status)}>{event.status}</Badge>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
            {tr('Идентификаторы провайдера', "Provayder identifikatorlari")}
          </div>
          <div className="rounded-token-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 flex flex-col gap-1.5 text-token-sm">
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">providerPaymentId</span>
              <span className="font-mono text-token-xs text-neutral-700 break-all text-right">{event.providerPaymentId || '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">providerInvoiceId</span>
              <span className="font-mono text-token-xs text-neutral-700 break-all text-right">{event.providerInvoiceId || '—'}</span>
            </div>
            {event.providerRefundId && (
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500">providerRefundId</span>
                <span className="font-mono text-token-xs text-neutral-700 break-all text-right">{event.providerRefundId}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">saleId / refundId</span>
              <span className="font-mono text-token-xs text-neutral-700 break-all text-right">{event.saleId || event.refundId || '—'}</span>
            </div>
            {event.fiscalReceiptId && (
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500">fiscalReceiptId</span>
                <span className="font-mono text-token-xs text-neutral-700 break-all text-right">{event.fiscalReceiptId}</span>
              </div>
            )}
            {event.reason && (
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500">{tr('Причина', 'Sabab')}</span>
                <span className="text-token-xs text-neutral-700 break-all text-right">{event.reason}</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
            rawProviderStatus
          </div>
          <pre className="rounded-token-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-token-xs text-neutral-700 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(event.rawProviderStatus ?? {}, null, 2)}
          </pre>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="primary" size="md" type="button" onClick={onClose}>
            {tr('Закрыть', 'Yopish')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function PosPaymentEvents() {
  const { tr, locale } = useAdminI18n();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const loadEvents = useCallback(async (targetStoreId: string) => {
    if (!targetStoreId) return;
    setLoading(true);
    try {
      const result = await adminApi.getPosPaymentEvents({ storeId: targetStoreId, limit: PAGE_SIZE });
      setEvents(Array.isArray(result?.items) ? result.items : []);
      setCursor(result?.nextCursor ?? null);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить платежи', "To'lovlarni yuklab bo'lmadi"));
      }
      setEvents([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    if (storeId) void loadEvents(storeId);
  }, [storeId, loadEvents]);

  async function loadMore() {
    if (!storeId || !cursor) return;
    setLoadingMore(true);
    try {
      const result = await adminApi.getPosPaymentEvents({ storeId, limit: PAGE_SIZE, cursor });
      setEvents((prev) => [...prev, ...(Array.isArray(result?.items) ? result.items : [])]);
      setCursor(result?.nextCursor ?? null);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить ещё', "Yana yuklab bo'lmadi"));
    } finally {
      setLoadingMore(false);
    }
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'createdAt',
      header: tr('Время', 'Vaqt'),
      render: (e) => new Date(e.createdAt).toLocaleString(locale),
    },
    {
      key: 'eventType',
      header: tr('Тип', 'Turi'),
      render: (e) => <Badge variant={paymentBadgeVariant(e.eventType)}>{e.eventType}</Badge>,
    },
    {
      key: 'provider',
      header: tr('Провайдер', 'Provayder'),
      render: (e) => <Badge variant={providerBadgeVariant(e.provider)}>{e.provider}</Badge>,
    },
    {
      key: 'operation',
      header: tr('Операция', 'Amaliyot'),
      render: (e) => e.operation,
    },
    {
      key: 'amount',
      header: tr('Сумма', 'Summa'),
      render: (e) => `${Number(e.amount).toLocaleString()} ${e.currency}`,
    },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (e) => <Badge variant={paymentBadgeVariant(e.status)}>{e.status}</Badge>,
    },
    {
      key: 'cashier',
      header: tr('Кассир', 'Kassir'),
      render: (e) => e.cashierName || e.cashierId || '—',
    },
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
          <Table
            columns={columns}
            data={events}
            rowKey={(e) => e.id}
            loading={loading}
            onRowClick={setSelected}
            emptyMessage={tr('Платежей пока нет', "Hali to'lovlar yo'q")}
          />

          {cursor && (
            <div className="flex justify-center">
              <Button variant="ghost" size="md" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Загрузить ещё', 'Yana yuklash')}
              </Button>
            </div>
          )}
        </>
      )}

      {selected && (
        <PaymentEventDetailModal event={selected} onClose={() => setSelected(null)} locale={locale} tr={tr} />
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
          POS · {tr('Платежи', "To'lovlar")}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr(
            'События платёжных провайдеров: подтверждения, отклонения, возвраты',
            "To'lov provayderlari hodisalari: tasdiqlar, rad etishlar, qaytarishlar"
          )}
        </p>
      </div>
    </header>
  );
}
