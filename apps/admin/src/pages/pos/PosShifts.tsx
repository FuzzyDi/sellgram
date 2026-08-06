import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge, { type BadgeVariant } from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import {
  usePosStores, isPlanBlockedError, PosPlanBlocked, PosSubNav, PosStoreSelect,
} from './pos-shared';
import {
  RECEIPT_TYPE_BADGE, statusBadgeVariant, pick, ReceiptDetailModal,
} from './pos-receipt-shared';

type NoticeTone = 'success' | 'error';
type DayTab = 'shifts' | 'receipts';

const PAGE_SIZE = 25;
const RECEIPT_PAGE_SIZE = 25;

// "Real-time" here means periodic refetch, not a push channel (WebSocket/
// SSE) — a genuinely instant feed is a separate, much bigger
// infrastructure decision. 20s keeps an open shift's badge and the
// receipts feed close to live without hammering the admin API.
const POLL_INTERVAL_MS = 20_000;

// zReportStatus is a free-form string on the wire (docs/POS_SYNC_API.md
// §12), but OK/FAILED/PENDING are the only values the real till contract
// currently sends — anything else (a future status, or a device on an
// older firmware) still renders, just without a color cue.
const Z_REPORT_BADGE: Record<string, BadgeVariant> = {
  OK: 'success',
  FAILED: 'danger',
  PENDING: 'warning',
};

interface ShiftReceiptsState {
  items: any[];
  cursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

// FiscalEvent.totalAmount is stored in tiyin (Int column, schema.prisma —
// confirmed by the /100 conversion pos-sync/routes.ts's loyalty accrual
// code applies to this same field) and is always positive regardless of
// receiptType — REFUND direction comes from receiptType, not the sign of
// totalAmount, so a shift total has to subtract refunds explicitly rather
// than just summing every receipt's totalAmount.
function computeShiftSums(items: any[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const r of items) {
    const sign = r.receiptType === 'REFUND' ? -1 : 1;
    const amount = (Number(r.totalAmount) || 0) / 100;
    const currency = r.currency || '—';
    sums[currency] = (sums[currency] || 0) + sign * amount;
  }
  return sums;
}

// A receipt can carry more than one payment (split cash+card) — joined
// with a comma rather than picking just the first, so the Чеки feed's
// "Тип оплаты" column doesn't silently hide a second payment method.
function paymentTypeSummary(payments: any[] | undefined): string {
  if (!Array.isArray(payments) || payments.length === 0) return '—';
  const types = payments.map((p) => pick(p, ['type', 'method', 'paymentType']) ?? '—');
  return types.join(', ');
}

export default function PosShifts() {
  const { tr, locale } = useAdminI18n();
  const [searchParams] = useSearchParams();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [activeTab, setActiveTab] = useState<DayTab>('shifts');

  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  const [shiftReceipts, setShiftReceipts] = useState<Record<string, ShiftReceiptsState>>({});
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);

  const [receiptsFeed, setReceiptsFeed] = useState<any[]>([]);
  const [receiptsFeedLoading, setReceiptsFeedLoading] = useState(true);
  const [receiptsFeedLoadingMore, setReceiptsFeedLoadingMore] = useState(false);
  const [receiptsFeedCursor, setReceiptsFeedCursor] = useState<string | null>(null);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  // Same "capture once at mount" reasoning as the old PosReceipts.tsx: the
  // URL-sync effect below would otherwise wipe a deep-linked storeId before
  // usePosStores' own fetch resolves.
  const initialUrlStoreId = useRef(searchParams.get('storeId')).current;
  const initialUrlShiftNumber = useRef(searchParams.get('shiftNumber')).current;

  useEffect(() => {
    if (initialUrlStoreId && stores.some((s) => s.id === initialUrlStoreId) && initialUrlStoreId !== storeId) {
      selectStore(initialUrlStoreId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  const loadShifts = useCallback(async (targetStoreId: string, silent = false) => {
    if (!targetStoreId) return;
    if (!silent) setLoading(true);
    try {
      const result = await adminApi.getPosShifts({ storeId: targetStoreId, limit: PAGE_SIZE });
      setShifts(Array.isArray(result?.items) ? result.items : []);
      setCursor(result?.nextCursor ?? null);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else if (!silent) {
        showNotice('error', err?.message || tr('Не удалось загрузить смены', "Smenalarni yuklab bo'lmadi"));
      }
      if (!silent) {
        setShifts([]);
        setCursor(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    if (storeId) void loadShifts(storeId);
  }, [storeId, loadShifts]);

  const loadReceiptsFeed = useCallback(async (targetStoreId: string, silent = false) => {
    if (!targetStoreId) return;
    if (!silent) setReceiptsFeedLoading(true);
    try {
      const result = await adminApi.getPosReceipts({ storeId: targetStoreId, limit: RECEIPT_PAGE_SIZE });
      setReceiptsFeed(Array.isArray(result?.items) ? result.items : []);
      setReceiptsFeedCursor(result?.nextCursor ?? null);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else if (!silent) {
        showNotice('error', err?.message || tr('Не удалось загрузить чеки', "Cheklarni yuklab bo'lmadi"));
      }
      if (!silent) {
        setReceiptsFeed([]);
        setReceiptsFeedCursor(null);
      }
    } finally {
      if (!silent) setReceiptsFeedLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    if (storeId && activeTab === 'receipts') void loadReceiptsFeed(storeId);
  }, [storeId, activeTab, loadReceiptsFeed]);

  // Polling — only the active tab's page-1 data, silently (no spinner, no
  // error toast on a transient miss). A "Load more" the user already did
  // gets reset back to page 1 on the next tick — an accepted trade-off for
  // keeping this simple (see POLL_INTERVAL_MS comment); the shifts/
  // receipts this loses are still one click of "Load more" away.
  useEffect(() => {
    if (!storeId) return;
    const id = setInterval(() => {
      if (activeTab === 'shifts') void loadShifts(storeId, true);
      else void loadReceiptsFeed(storeId, true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [storeId, activeTab, loadShifts, loadReceiptsFeed]);

  // Deep-link auto-expand: once the matching shift has loaded, open it —
  // only once, so the user can freely collapse it afterward without this
  // effect re-forcing it back open on an unrelated re-render.
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (autoExpandedRef.current || !initialUrlShiftNumber || shifts.length === 0) return;
    const match = shifts.find((s) => String(s.shiftNumber) === initialUrlShiftNumber);
    if (match) {
      autoExpandedRef.current = true;
      setExpandedShiftId(match.id);
    }
  }, [shifts, initialUrlShiftNumber]);

  async function loadMoreShifts() {
    if (!storeId || !cursor) return;
    setLoadingMore(true);
    try {
      const result = await adminApi.getPosShifts({ storeId, limit: PAGE_SIZE, cursor });
      setShifts((prev) => [...prev, ...(Array.isArray(result?.items) ? result.items : [])]);
      setCursor(result?.nextCursor ?? null);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить ещё', "Yana yuklab bo'lmadi"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreReceiptsFeed() {
    if (!storeId || !receiptsFeedCursor) return;
    setReceiptsFeedLoadingMore(true);
    try {
      const result = await adminApi.getPosReceipts({ storeId, limit: RECEIPT_PAGE_SIZE, cursor: receiptsFeedCursor });
      setReceiptsFeed((prev) => [...prev, ...(Array.isArray(result?.items) ? result.items : [])]);
      setReceiptsFeedCursor(result?.nextCursor ?? null);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить ещё', "Yana yuklab bo'lmadi"));
    } finally {
      setReceiptsFeedLoadingMore(false);
    }
  }

  const loadShiftReceipts = useCallback(async (shift: any, append: boolean) => {
    setShiftReceipts((prev) => ({
      ...prev,
      [shift.id]: {
        items: append ? (prev[shift.id]?.items ?? []) : [],
        cursor: append ? (prev[shift.id]?.cursor ?? null) : null,
        loading: !append,
        loadingMore: append,
        error: null,
      },
    }));
    try {
      const result = await adminApi.getPosReceipts({
        storeId,
        deviceId: shift.deviceId,
        shiftNumber: shift.shiftNumber,
        limit: RECEIPT_PAGE_SIZE,
        cursor: append ? (shiftReceipts[shift.id]?.cursor ?? undefined) : undefined,
      });
      const newItems = Array.isArray(result?.items) ? result.items : [];
      setShiftReceipts((prev) => ({
        ...prev,
        [shift.id]: {
          items: append ? [...(prev[shift.id]?.items ?? []), ...newItems] : newItems,
          cursor: result?.nextCursor ?? null,
          loading: false,
          loadingMore: false,
          error: null,
        },
      }));
    } catch (err: any) {
      setShiftReceipts((prev) => ({
        ...prev,
        [shift.id]: {
          items: prev[shift.id]?.items ?? [],
          cursor: prev[shift.id]?.cursor ?? null,
          loading: false,
          loadingMore: false,
          error: err?.message || tr('Не удалось загрузить чеки', "Cheklarni yuklab bo'lmadi"),
        },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function toggleShift(shift: any) {
    setExpandedShiftId((prev) => {
      const next = prev === shift.id ? null : shift.id;
      // Only fetch on first expand — an already-cached entry (even one
      // that's still `loading`) means a fetch is already in flight or done,
      // so re-expanding never refetches.
      if (next && !shiftReceipts[shift.id]) {
        void loadShiftReceipts(shift, false);
      }
      return next;
    });
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'expand',
      header: '',
      render: (s) => (
        <span className="text-neutral-400">
          {expandedShiftId === s.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      ),
    },
    {
      key: 'shiftNumber',
      header: tr('№ смены', 'Smena №'),
      render: (s) => <span className="font-semibold text-neutral-800">{s.shiftNumber}</span>,
    },
    {
      key: 'device',
      header: tr('Касса', 'Kassa'),
      render: (s) => s.device?.name || '—',
    },
    {
      key: 'openedAtMs',
      header: tr('Открыта', 'Ochilgan'),
      render: (s) => (s.openedAtMs ? new Date(s.openedAtMs).toLocaleString(locale) : '—'),
    },
    {
      key: 'closedAtMs',
      header: tr('Закрыта', 'Yopilgan'),
      render: (s) => (s.closedAtMs ? new Date(s.closedAtMs).toLocaleString(locale) : '—'),
    },
    {
      key: 'zReportStatus',
      header: 'Z-отчёт',
      // isOpen shifts have no zReportStatus yet — a still-running shift, not
      // a Z-report outcome to badge, so it gets its own distinct label
      // rather than falling through Z_REPORT_BADGE's "neutral" default.
      render: (s) => (
        s.isOpen
          ? <Badge variant="info">{tr('Открыта', 'Ochiq')}</Badge>
          : <Badge variant={Z_REPORT_BADGE[s.zReportStatus] || 'neutral'}>{s.zReportStatus}</Badge>
      ),
    },
    {
      key: 'sum',
      header: tr('Сумма', 'Summa'),
      render: (s) => <ShiftSumCell state={shiftReceipts[s.id]} locale={locale} tr={tr} />,
    },
  ];

  const receiptsFeedColumns: TableColumn<any>[] = [
    {
      key: 'receiptNumber',
      header: tr('№ чека', 'Chek №'),
      render: (r) => <span className="font-semibold text-neutral-800">{r.receiptNumber || r.localReceiptId}</span>,
    },
    {
      key: 'createdAtMs',
      header: tr('Дата', 'Sana'),
      render: (r) => new Date(r.createdAtMs).toLocaleString(locale),
    },
    {
      key: 'device',
      header: tr('Касса', 'Kassa'),
      render: (r) => r.device?.name || '—',
    },
    {
      key: 'paymentType',
      header: tr('Тип оплаты', "To'lov turi"),
      render: (r) => paymentTypeSummary(r.payments),
    },
    {
      key: 'receiptType',
      header: tr('Тип', 'Turi'),
      render: (r) => <Badge variant={RECEIPT_TYPE_BADGE[r.receiptType] || 'neutral'}>{r.receiptType || '—'}</Badge>,
    },
    {
      key: 'totalAmount',
      header: tr('Сумма', 'Summa'),
      render: (r) => <span className="font-semibold text-neutral-800">{(Number(r.totalAmount) / 100).toLocaleString(locale)} {r.currency}</span>,
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

  const expandedShift = shifts.find((s) => s.id === expandedShiftId) ?? null;

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
          <div className="flex gap-2 border-b border-neutral-200">
            <button
              type="button"
              onClick={() => setActiveTab('shifts')}
              className={[
                'px-3.5 py-2 text-token-sm font-semibold border-b-2 -mb-px transition-colors',
                activeTab === 'shifts' ? 'border-brand-500 text-neutral-800' : 'border-transparent text-neutral-500 hover:text-neutral-700',
              ].join(' ')}
            >
              {tr('Смены', 'Smenalar')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('receipts')}
              className={[
                'px-3.5 py-2 text-token-sm font-semibold border-b-2 -mb-px transition-colors',
                activeTab === 'receipts' ? 'border-brand-500 text-neutral-800' : 'border-transparent text-neutral-500 hover:text-neutral-700',
              ].join(' ')}
            >
              {tr('Чеки', 'Cheklar')}
            </button>
          </div>

          {activeTab === 'shifts' ? (
            <>
              <Table
                columns={columns}
                data={shifts}
                rowKey={(s) => s.id}
                loading={loading}
                onRowClick={toggleShift}
                emptyMessage={tr('Смен пока нет', "Hali smenalar yo'q")}
              />

              {expandedShift && (
                <ExpandedShiftReceipts
                  shift={expandedShift}
                  state={shiftReceipts[expandedShift.id]}
                  locale={locale}
                  tr={tr}
                  onLoadMore={() => loadShiftReceipts(expandedShift, true)}
                  onSelectReceipt={setSelectedReceipt}
                />
              )}

              {cursor && (
                <div className="flex justify-center">
                  <Button variant="ghost" size="md" type="button" onClick={() => void loadMoreShifts()} disabled={loadingMore}>
                    {loadingMore ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Загрузить ещё', 'Yana yuklash')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <Table
                columns={receiptsFeedColumns}
                data={receiptsFeed}
                rowKey={(r) => r.id}
                loading={receiptsFeedLoading}
                onRowClick={setSelectedReceipt}
                emptyMessage={tr('Чеков пока нет', "Hali cheklar yo'q")}
              />

              {receiptsFeedCursor && (
                <div className="flex justify-center">
                  <Button variant="ghost" size="md" type="button" onClick={() => void loadMoreReceiptsFeed()} disabled={receiptsFeedLoadingMore}>
                    {receiptsFeedLoadingMore ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Загрузить ещё', 'Yana yuklash')}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {selectedReceipt && (
        <ReceiptDetailModal receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} locale={locale} tr={tr} />
      )}
    </section>
  );
}

function ShiftSumCell({ state, locale, tr }: {
  state: ShiftReceiptsState | undefined; locale: string; tr: (ru: string, uz: string) => string;
}) {
  if (!state || state.loading) return <span className="text-neutral-400">…</span>;
  if (state.error) return <span className="text-danger">—</span>;
  const sums = computeShiftSums(state.items);
  const currencies = Object.keys(sums);
  if (currencies.length === 0) return <span className="text-neutral-400">0</span>;
  const partial = state.cursor !== null;
  return (
    <div className="text-right">
      {currencies.map((c) => (
        <div key={c} className="font-semibold text-neutral-800 whitespace-nowrap">
          {sums[c].toLocaleString(locale)} {c}
        </div>
      ))}
      {partial && (
        <div className="text-token-xs text-neutral-400 whitespace-nowrap">
          {tr(`Σ по ${state.items.length} загруженным чекам`, `Yuklangan ${state.items.length} chek bo'yicha`)}
        </div>
      )}
    </div>
  );
}

function ExpandedShiftReceipts({ shift, state, locale, tr, onLoadMore, onSelectReceipt }: {
  shift: any;
  state: ShiftReceiptsState | undefined;
  locale: string;
  tr: (ru: string, uz: string) => string;
  onLoadMore: () => void;
  onSelectReceipt: (r: any) => void;
}) {
  const sums = useMemo(() => computeShiftSums(state?.items ?? []), [state?.items]);
  const currencies = Object.keys(sums);
  const partial = state?.cursor !== null && state?.cursor !== undefined;

  const columns: TableColumn<any>[] = [
    {
      key: 'receiptNumber',
      header: tr('№ чека', 'Chek №'),
      render: (r) => <span className="font-semibold text-neutral-800">{r.receiptNumber || r.localReceiptId}</span>,
    },
    {
      key: 'createdAtMs',
      header: tr('Дата', 'Sana'),
      render: (r) => new Date(r.createdAtMs).toLocaleString(locale),
    },
    {
      key: 'operatorName',
      header: tr('Кассир', 'Kassir'),
      render: (r) => r.operatorName || '—',
    },
    {
      key: 'totalAmount',
      header: tr('Сумма', 'Summa'),
      // See computeShiftSums' comment — totalAmount is tiyin, always positive.
      render: (r) => `${(Number(r.totalAmount) / 100).toLocaleString(locale)} ${r.currency}`,
    },
    {
      key: 'receiptType',
      header: tr('Тип', 'Turi'),
      render: (r) => <Badge variant={RECEIPT_TYPE_BADGE[r.receiptType] || 'neutral'}>{r.receiptType || '—'}</Badge>,
    },
    {
      key: 'fiscalStatus',
      header: tr('Статус', 'Holat'),
      render: (r) => <Badge variant={statusBadgeVariant(r.fiscalStatus)}>{r.fiscalStatus}</Badge>,
    },
  ];

  return (
    <Card className="border-l-4 border-l-brand-500">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="m-0 text-token-base font-semibold text-neutral-800">
          {tr('Чеки смены', 'Smena cheklari')} №{shift.shiftNumber} · {shift.device?.name || '—'}
          {shift.isOpen && <Badge variant="info" className="ml-2">{tr('Открыта', 'Ochiq')}</Badge>}
        </h3>
        {currencies.length > 0 && (
          <div className="text-right">
            {currencies.map((c) => (
              <span key={c} className="ml-3 font-semibold text-neutral-800">
                {partial ? tr('Σ (частично): ', 'Σ (qisman): ') : tr('Итого: ', 'Jami: ')}
                {sums[c].toLocaleString(locale)} {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {state?.error && (
        <p className="text-token-sm text-danger mb-3">{state.error}</p>
      )}

      <Table
        columns={columns}
        data={state?.items ?? []}
        rowKey={(r) => r.id}
        loading={!!state?.loading}
        onRowClick={onSelectReceipt}
        emptyMessage={tr('Чеков в этой смене нет', "Bu smenada cheklar yo'q")}
      />

      {state?.cursor && (
        <div className="flex justify-center mt-3">
          <Button variant="ghost" size="sm" type="button" onClick={onLoadMore} disabled={state.loadingMore}>
            {state.loadingMore ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Загрузить ещё чеки', 'Yana cheklar yuklash')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function PosHeader({ tr }: { tr: (ru: string, uz: string) => string }) {
  return (
    <header className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-token-2xl font-semibold text-neutral-800 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-channel-pos" aria-hidden="true" />
          POS · {tr('Операционный день', 'Ish kuni')}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr('Смены (включая открытые) и живой список чеков — только просмотр', "Smenalar (ochiqlari ham) va cheklarning jonli ro'yxati — faqat ko'rish uchun")}
        </p>
      </div>
    </header>
  );
}
