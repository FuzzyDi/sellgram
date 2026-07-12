import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

// zReportStatus is a free-form string on the wire (docs/POS_SYNC_API.md
// §12), but OK/FAILED/PENDING are the only values the real till contract
// currently sends — anything else (a future status, or a device on an
// older firmware) still renders, just without a color cue.
const Z_REPORT_BADGE: Record<string, BadgeVariant> = {
  OK: 'success',
  FAILED: 'danger',
  PENDING: 'warning',
};

export default function PosShifts() {
  const { tr, locale } = useAdminI18n();
  const navigate = useNavigate();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const loadShifts = useCallback(async (targetStoreId: string) => {
    if (!targetStoreId) return;
    setLoading(true);
    try {
      const result = await adminApi.getPosShifts({ storeId: targetStoreId, limit: PAGE_SIZE });
      setShifts(Array.isArray(result?.items) ? result.items : []);
      setCursor(result?.nextCursor ?? null);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить смены', "Smenalarni yuklab bo'lmadi"));
      }
      setShifts([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    if (storeId) void loadShifts(storeId);
  }, [storeId, loadShifts]);

  async function loadMore() {
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

  function goToReceipts(shift: any) {
    navigate(`/pos/receipts?storeId=${encodeURIComponent(storeId)}&shiftNumber=${encodeURIComponent(shift.shiftNumber)}`);
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'shiftNumber',
      header: tr('№ смены', 'Smena №'),
      render: (s) => <span className="font-semibold text-neutral-800">{s.shiftNumber}</span>,
    },
    {
      key: 'device',
      header: tr('Устройство', 'Qurilma'),
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
      render: (s) => <Badge variant={Z_REPORT_BADGE[s.zReportStatus] || 'neutral'}>{s.zReportStatus}</Badge>,
    },
    {
      key: 'actions',
      header: tr('Действия', 'Amallar'),
      render: (s) => (
        <Button variant="ghost" size="sm" type="button" onClick={(e) => { e?.stopPropagation(); goToReceipts(s); }}>
          {tr('Чеки', 'Cheklar')}
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
          <Table
            columns={columns}
            data={shifts}
            rowKey={(s) => s.id}
            loading={loading}
            onRowClick={goToReceipts}
            emptyMessage={tr('Закрытых смен пока нет', "Hali yopilgan smenalar yo'q")}
          />

          {cursor && (
            <div className="flex justify-center">
              <Button variant="ghost" size="md" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Загрузить ещё', "Yana yuklash")}
              </Button>
            </div>
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
          POS · {tr('Смены', 'Smenalar')}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr('Закрытые смены (Z-отчёты) кассовых устройств', "Kassa qurilmalarining yopilgan smenalari (Z-hisobotlar)")}
        </p>
      </div>
    </header>
  );
}
