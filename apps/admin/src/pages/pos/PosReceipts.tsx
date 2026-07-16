import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge, { type BadgeVariant } from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import {
  usePosStores, isPlanBlockedError, PosPlanBlocked, PosSubNav, PosStoreSelect,
} from './pos-shared';

type NoticeTone = 'success' | 'error';

const PAGE_SIZE = 25;

const RECEIPT_TYPE_BADGE: Record<string, BadgeVariant> = {
  SALE: 'success',
  REFUND: 'danger',
};

// operatorRole is the till's own free-form snapshot string
// (docs/POS_POLICY_ENGINE.md §14.1) — lowercase/underscore convention as
// sent by the device, distinct from PosOperator.role's uppercase enum
// (POS_OPERATOR_ROLES in pos-shared.tsx), so it gets its own small label
// map rather than reusing that one.
const OPERATOR_ROLE_LABEL: Record<string, [string, string]> = {
  cashier: ['Кассир', 'Kassir'],
  senior_cashier: ['Старший кассир', 'Katta kassir'],
  admin: ['Администратор', 'Administrator'],
};

// fiscalStatus is a free-form string on the wire (docs/POS_SYNC_API.md
// §12/§703) — no fixed enum to map exactly, so this is a best-effort
// heuristic on common substrings rather than a literal lookup table.
function statusBadgeVariant(status: string): BadgeVariant {
  const s = String(status || '').toUpperCase();
  if (s.includes('SUCCESS') || s.includes('OK') || s.includes('DONE')) return 'success';
  if (s.includes('FAIL') || s.includes('ERROR')) return 'danger';
  if (s.includes('PENDING') || s.includes('WAIT')) return 'warning';
  return 'neutral';
}

// items/payments are stored as unconstrained Json (z.record(z.unknown())
// on the wire, docs/POS_SYNC_API.md — same "loose bag, shape settles with
// real usage" reasoning as rawFiscalPayload/PlatformPolicy.extra). These
// readers pick the most plausible key aliases a till might send and fall
// back to a raw dump if nothing recognizable is present.
function pick(obj: any, keys: string[]): any {
  for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

// A weighted item's fiscal `qty` is stored in grams (the till weighs and
// reports the raw gram count, same convention as Product.pricePerKg on
// the catalog side) — a kg-unit item showing "1500" instead of "1.500 кг"
// is that raw gram figure with no unit conversion applied, not a real
// 1500-of-something sale. Exact-string unit matching, not case-folded
// beyond the literal кг/KG/kg and г/G/g forms actually seen on the wire.
const WEIGHT_KG_UNITS = ['кг', 'KG', 'kg'];
const WEIGHT_G_UNITS = ['г', 'G', 'g'];

function formatItemQty(item: any): string {
  const qty = pick(item, ['qty', 'quantity']);
  if (qty === undefined) return '—';
  const unit = pick(item, ['unit']);
  if (WEIGHT_KG_UNITS.includes(unit)) return `${(Number(qty) / 1000).toFixed(3)} кг`;
  if (WEIGHT_G_UNITS.includes(unit)) return `${qty} г`;
  return String(qty);
}

function formatItemPrice(item: any): string {
  const price = pick(item, ['price', 'unitPrice']);
  if (price === undefined) return '—';
  const unit = pick(item, ['unit']);
  if (WEIGHT_KG_UNITS.includes(unit)) return `${price}/кг`;
  return String(price);
}

function ReceiptItemsTable({ items }: { items: any[] }) {
  const { tr } = useAdminI18n();
  if (!items?.length) return <p className="text-token-sm text-neutral-500">{tr('Нет позиций', "Pozitsiyalar yo'q")}</p>;
  return (
    <table className="w-full text-token-sm border-collapse">
      <thead>
        <tr className="border-b border-neutral-200">
          <th className="text-left py-1.5 pr-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Название', 'Nomi')}</th>
          <th className="text-right py-1.5 px-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Кол-во', 'Soni')}</th>
          <th className="text-right py-1.5 px-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Цена', 'Narxi')}</th>
          <th className="text-right py-1.5 pl-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Сумма', 'Summa')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} className="border-b border-neutral-100 last:border-0">
            <td className="py-1.5 pr-2 text-neutral-800">{pick(item, ['name', 'title', 'productName']) ?? '—'}</td>
            <td className="py-1.5 px-2 text-right text-neutral-600">{formatItemQty(item)}</td>
            <td className="py-1.5 px-2 text-right text-neutral-600">{formatItemPrice(item)}</td>
            <td className="py-1.5 pl-2 text-right font-semibold text-neutral-800">{pick(item, ['sum', 'total', 'amount']) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReceiptPaymentsTable({ payments }: { payments: any[] }) {
  const { tr } = useAdminI18n();
  if (!payments?.length) return <p className="text-token-sm text-neutral-500">{tr('Нет оплат', "To'lovlar yo'q")}</p>;
  return (
    <table className="w-full text-token-sm border-collapse">
      <thead>
        <tr className="border-b border-neutral-200">
          <th className="text-left py-1.5 pr-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Тип', 'Turi')}</th>
          <th className="text-right py-1.5 pl-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Сумма', 'Summa')}</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p, i) => (
          <tr key={i} className="border-b border-neutral-100 last:border-0">
            <td className="py-1.5 pr-2 text-neutral-800">{pick(p, ['type', 'method', 'paymentType']) ?? '—'}</td>
            <td className="py-1.5 pl-2 text-right font-semibold text-neutral-800">{pick(p, ['sum', 'amount', 'total']) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReceiptDetailModal({ receipt, onClose, locale, tr }: {
  receipt: any; onClose: () => void; locale: string; tr: (ru: string, uz: string) => string;
}) {
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 mb-1 text-token-base font-semibold text-neutral-800">
          {tr('Чек', 'Chek')} №{receipt.receiptNumber || receipt.localReceiptId}
        </h3>
        <p className="text-token-xs text-neutral-500 mb-3">
          {new Date(receipt.createdAtMs).toLocaleString(locale)} · {receipt.device?.name || '—'} · {tr('Смена', 'Smena')} {receipt.shiftNumber}
        </p>

        <div className="mb-4">
          <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
            {tr('Позиции', 'Pozitsiyalar')}
          </div>
          <ReceiptItemsTable items={receipt.items} />
        </div>

        {receipt.operatorName && (
          <div className="mb-4">
            <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
              {tr('Кассир', 'Kassir')}
            </div>
            <div className="rounded-token-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 flex justify-between gap-3 text-token-sm">
              <span className="font-semibold text-neutral-800">{receipt.operatorName}</span>
              <span className="text-neutral-500">
                {receipt.operatorRole
                  ? tr(...(OPERATOR_ROLE_LABEL[receipt.operatorRole] || [receipt.operatorRole, receipt.operatorRole]))
                  : '—'}
              </span>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
            {tr('Оплаты', "To'lovlar")}
          </div>
          <ReceiptPaymentsTable payments={receipt.payments} />
        </div>

        <div>
          <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
            {tr('Фискальные данные', "Fiskal ma'lumotlar")}
          </div>
          <div className="rounded-token-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 flex flex-col gap-1.5 text-token-sm">
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">{tr('Статус', 'Holat')}</span>
              <Badge variant={statusBadgeVariant(receipt.fiscalStatus)}>{receipt.fiscalStatus}</Badge>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">{tr('Сумма', 'Summa')}</span>
              <span className="font-semibold text-neutral-800">{Number(receipt.totalAmount).toLocaleString()} {receipt.currency}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">ФП (fiscalSign)</span>
              <span className="font-mono text-token-xs text-neutral-700 break-all text-right">{receipt.fiscalSign || '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">QR</span>
              <span className="font-mono text-token-xs text-neutral-700 break-all text-right">{receipt.fiscalQr || '—'}</span>
            </div>
          </div>
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

export default function PosReceipts() {
  const { tr, locale } = useAdminI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [devices, setDevices] = useState<any[]>([]);
  const [deviceFilter, setDeviceFilter] = useState(searchParams.get('deviceId') || '');
  const [shiftFilter, setShiftFilter] = useState(searchParams.get('shiftNumber') || '');

  const [receipts, setReceipts] = useState<any[]>([]);
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

  // Captured once at mount, not re-read from `searchParams` later — the
  // "sync filters into the URL" effect below fires on the very first
  // render (storeId is still '' while usePosStores' fetch is in flight)
  // and rewrites the query string, which would otherwise wipe the
  // deep-linked storeId before usePosStores even resolves and this effect
  // gets a non-empty `stores` array to check it against.
  const initialUrlStoreId = useRef(searchParams.get('storeId')).current;

  // Pre-fill the store from the URL (arriving from PosShifts' "Чеки" link)
  // once stores have loaded, overriding usePosStores' own localStorage-based
  // default — a deep link into a specific shift's receipts should always
  // win over "whatever store you last had selected".
  useEffect(() => {
    if (initialUrlStoreId && stores.some((s) => s.id === initialUrlStoreId) && initialUrlStoreId !== storeId) {
      selectStore(initialUrlStoreId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  useEffect(() => {
    if (!storeId) { setDevices([]); return; }
    adminApi.getPosDevices(storeId).then((list: any) => setDevices(Array.isArray(list) ? list : [])).catch(() => setDevices([]));
  }, [storeId]);

  const loadReceipts = useCallback(async (targetStoreId: string) => {
    if (!targetStoreId) return;
    setLoading(true);
    try {
      const result = await adminApi.getPosReceipts({
        storeId: targetStoreId,
        limit: PAGE_SIZE,
        deviceId: deviceFilter || undefined,
        shiftNumber: shiftFilter ? Number(shiftFilter) : undefined,
      });
      setReceipts(Array.isArray(result?.items) ? result.items : []);
      setCursor(result?.nextCursor ?? null);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить чеки', "Cheklarni yuklab bo'lmadi"));
      }
      setReceipts([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [tr, deviceFilter, shiftFilter]);

  useEffect(() => {
    if (storeId) void loadReceipts(storeId);
  }, [storeId, loadReceipts]);

  // Keep the URL in sync with the active filters so the "Чеки" deep link
  // from PosShifts and manual filter changes both reflect in the address
  // bar the same way.
  useEffect(() => {
    const next = new URLSearchParams();
    if (storeId) next.set('storeId', storeId);
    if (deviceFilter) next.set('deviceId', deviceFilter);
    if (shiftFilter) next.set('shiftNumber', shiftFilter);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, deviceFilter, shiftFilter]);

  async function loadMore() {
    if (!storeId || !cursor) return;
    setLoadingMore(true);
    try {
      const result = await adminApi.getPosReceipts({
        storeId, limit: PAGE_SIZE, cursor,
        deviceId: deviceFilter || undefined,
        shiftNumber: shiftFilter ? Number(shiftFilter) : undefined,
      });
      setReceipts((prev) => [...prev, ...(Array.isArray(result?.items) ? result.items : [])]);
      setCursor(result?.nextCursor ?? null);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить ещё', "Yana yuklab bo'lmadi"));
    } finally {
      setLoadingMore(false);
    }
  }

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
      key: 'device',
      header: tr('Устройство', 'Qurilma'),
      render: (r) => r.device?.name || '—',
    },
    {
      key: 'operatorName',
      header: tr('Кассир', 'Kassir'),
      render: (r) => r.operatorName || '—',
    },
    {
      key: 'totalAmount',
      header: tr('Сумма', 'Summa'),
      render: (r) => `${Number(r.totalAmount).toLocaleString()} ${r.currency}`,
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
    {
      key: 'actions',
      header: tr('Действия', 'Amallar'),
      render: (r) => (
        <Button variant="ghost" size="sm" type="button" onClick={(e) => { e?.stopPropagation(); setSelected(r); }}>
          {tr('Детали', "Batafsil")}
        </Button>
      ),
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
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label={tr('Устройство', 'Qurilma')}
                value={deviceFilter}
                onChange={(e) => setDeviceFilter(e.target.value)}
              >
                <option value="">{tr('Все устройства', 'Barcha qurilmalar')}</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Input
                label={tr('№ смены', 'Smena №')}
                type="number"
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
                placeholder={tr('Все смены', 'Barcha smenalar')}
              />
            </div>
          </Card>

          <Table
            columns={columns}
            data={receipts}
            rowKey={(r) => r.id}
            loading={loading}
            onRowClick={setSelected}
            emptyMessage={tr('Чеков пока нет', "Hali cheklar yo'q")}
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
        <ReceiptDetailModal receipt={selected} onClose={() => setSelected(null)} locale={locale} tr={tr} />
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
          POS · {tr('Чеки', 'Cheklar')}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr('Фискализированные чеки кассовых устройств', "Kassa qurilmalarining fiskallashtirilgan cheklari")}
        </p>
      </div>
    </header>
  );
}
