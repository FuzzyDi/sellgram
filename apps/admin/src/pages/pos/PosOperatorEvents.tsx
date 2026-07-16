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

const EVENT_TYPE_BADGE: Record<string, BadgeVariant> = {
  OPERATOR_LOGIN: 'success',
  OPERATOR_LOCK: 'neutral',
  OPERATOR_SWITCH: 'warning',
  OPERATOR_PIN_FAILED: 'danger',
  OPERATOR_PIN_BLOCKED: 'danger',
};

const EVENT_TYPE_LABEL: Record<string, [string, string]> = {
  OPERATOR_LOGIN: ['Вход', 'Kirish'],
  OPERATOR_LOCK: ['Блокировка', 'Bloklash'],
  OPERATOR_SWITCH: ['Смена оператора', 'Operator almashtirish'],
  OPERATOR_PIN_FAILED: ['Неверный PIN', "Noto'g'ri PIN"],
  OPERATOR_PIN_BLOCKED: ['PIN заблокирован', 'PIN bloklandi'],
};

function EventDetailModal({ event, onClose, locale, tr }: {
  event: any; onClose: () => void; locale: string; tr: (ru: string, uz: string) => string;
}) {
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 mb-1 text-token-base font-semibold text-neutral-800 flex items-center gap-2">
          <Badge variant={EVENT_TYPE_BADGE[event.eventType] || 'neutral'}>
            {tr(...(EVENT_TYPE_LABEL[event.eventType] || [event.eventType, event.eventType]))}
          </Badge>
        </h3>
        <p className="text-token-xs text-neutral-500 mb-3">
          {new Date(event.createdAt).toLocaleString(locale)} · {event.device?.name || '—'}
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3 text-token-sm">
          <div>
            <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              {tr('Оператор', 'Operator')}
            </div>
            <div className="text-neutral-800">{event.operatorName || event.operatorId || '—'}</div>
          </div>
          <div>
            <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              {tr('Инициатор', 'Boshlagan')}
            </div>
            <div className="text-neutral-800">{event.actorName || event.actorId || '—'}</div>
          </div>
        </div>

        <div>
          <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
            Payload
          </div>
          <pre className="rounded-token-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-token-xs text-neutral-700 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(event.payload ?? {}, null, 2)}
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

export default function PosOperatorEvents() {
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
      const result = await adminApi.getPosOperatorEvents({ storeId: targetStoreId, limit: PAGE_SIZE });
      setEvents(Array.isArray(result?.items) ? result.items : []);
      setCursor(result?.nextCursor ?? null);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить события', "Hodisalarni yuklab bo'lmadi"));
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
      const result = await adminApi.getPosOperatorEvents({ storeId, limit: PAGE_SIZE, cursor });
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
      render: (e) => (
        <Badge variant={EVENT_TYPE_BADGE[e.eventType] || 'neutral'}>
          {tr(...(EVENT_TYPE_LABEL[e.eventType] || [e.eventType, e.eventType]))}
        </Badge>
      ),
    },
    {
      key: 'operator',
      header: tr('Оператор', 'Operator'),
      render: (e) => e.operatorName || e.operatorId || '—',
    },
    {
      key: 'actor',
      header: tr('Инициатор', 'Boshlagan'),
      render: (e) => e.actorName || e.actorId || '—',
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
            emptyMessage={tr('Событий пока нет', "Hali hodisalar yo'q")}
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
        <EventDetailModal event={selected} onClose={() => setSelected(null)} locale={locale} tr={tr} />
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
          POS · {tr('События', 'Hodisalar')}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr('Аудит операторов: блокировки, входы, смены, попытки PIN', 'Operatorlar auditi: bloklash, kirish, almashtirish, PIN urinishlari')}
        </p>
      </div>
    </header>
  );
}
