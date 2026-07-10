import React, { useEffect, useState } from 'react';
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

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  PENDING: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'neutral',
  REVOKED: 'danger',
};

export default function PosDevices() {
  const { tr, locale } = useAdminI18n();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [devices, setDevices] = useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formStoreId, setFormStoreId] = useState('');
  const [saving, setSaving] = useState(false);
  const [activation, setActivation] = useState<{ code: string; expiresAt: string; deviceName: string } | null>(null);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  function statusLabel(status: string) {
    switch (status) {
      case 'PENDING': return tr('Ожидает активации', 'Faollashtirish kutilmoqda');
      case 'ACTIVE': return tr('Активно', 'Faol');
      case 'SUSPENDED': return tr('Приостановлено', "To'xtatilgan");
      case 'REVOKED': return tr('Отозвано', 'Bekor qilingan');
      default: return status;
    }
  }

  async function loadDevices(targetStoreId: string) {
    if (!targetStoreId) return;
    setLoadingDevices(true);
    try {
      const list = await adminApi.getPosDevices(targetStoreId);
      setDevices(Array.isArray(list) ? list : []);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить устройства', "Qurilmalarni yuklab bo'lmadi"));
      }
      setDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }

  useEffect(() => {
    if (storeId) void loadDevices(storeId);
  }, [storeId]);

  function openCreate() {
    setFormName('');
    setFormStoreId(storeId);
    setFormOpen(true);
  }

  async function submitCreate() {
    if (!formName.trim() || !formStoreId) return;
    setSaving(true);
    try {
      const result = await adminApi.createPosDevice({ storeId: formStoreId, name: formName.trim() });
      setActivation({
        code: result.activationCode,
        expiresAt: result.expiresAt,
        deviceName: result.device?.name || formName.trim(),
      });
      setFormOpen(false);
      if (formStoreId === storeId) await loadDevices(storeId);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  // Manually (re)builds and stores the catalog snapshot the store's
  // devices pull from — not auto-triggered on product/category changes
  // yet (docs/SBGCLOUD_ARCHITECTURE.md §13), so a manager clicks this
  // after editing the catalog. Store-scoped, not device-scoped (the
  // endpoint takes storeId, not a deviceId), hence one shared button
  // rather than one per device row.
  async function refreshCatalog() {
    if (!storeId) return;
    setRefreshingCatalog(true);
    try {
      await adminApi.createCatalogSnapshot(storeId);
      showNotice('success', tr('Каталог обновлён', 'Katalog yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось обновить каталог', "Katalogni yangilab bo'lmadi"));
    } finally {
      setRefreshingCatalog(false);
    }
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'name',
      header: tr('Устройство', 'Qurilma'),
      render: (d) => (
        <div>
          <div className="font-semibold text-neutral-800">{d.name}</div>
          <div className="text-token-xs text-neutral-500">{d.deviceType}</div>
        </div>
      ),
    },
    {
      key: 'deviceCode',
      header: 'Device code',
      render: (d) => <span className="font-mono text-token-xs text-neutral-600">{d.deviceCode || '—'}</span>,
    },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (d) => <Badge variant={STATUS_BADGE[d.status] || 'neutral'}>{statusLabel(d.status)}</Badge>,
    },
    {
      key: 'connection',
      header: tr('Подключение', 'Ulanish'),
      render: (d) => (
        isOnline(d.lastSeenAt)
          ? <Badge variant="success">Online</Badge>
          : <Badge variant="neutral">Offline</Badge>
      ),
    },
    {
      key: 'lastSeenAt',
      header: tr('Последний heartbeat', 'Oxirgi heartbeat'),
      render: (d) => (d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString(locale) : '—'),
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
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="md" type="button" onClick={() => void refreshCatalog()} disabled={refreshingCatalog}>
              {refreshingCatalog ? tr('Обновление...', 'Yangilanmoqda...') : tr('Обновить каталог', 'Katalogni yangilash')}
            </Button>
            <Button variant="primary" size="md" type="button" onClick={openCreate}>
              + {tr('Добавить устройство', "Qurilma qo'shish")}
            </Button>
          </div>

          <Table
            columns={columns}
            data={devices}
            rowKey={(d) => d.id}
            loading={loadingDevices}
            emptyMessage={tr('Устройств пока нет', "Hali qurilmalar yo'q")}
          />
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={() => !saving && setFormOpen(false)}>
          <Card className="w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-3 text-token-base font-semibold text-neutral-800">
              {tr('Новое устройство', 'Yangi qurilma')}
            </h3>
            <div className="flex flex-col gap-3">
              <Input
                label={tr('Название', 'Nomi')}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={tr('Касса у входа', 'Kirish kassasi')}
              />
              <Select
                label={tr('Магазин', "Do'kon")}
                value={formStoreId}
                onChange={(e) => setFormStoreId(e.target.value)}
              >
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="md" type="button" onClick={() => setFormOpen(false)} disabled={saving}>
                {tr('Отмена', 'Bekor')}
              </Button>
              <Button variant="primary" size="md" type="button" onClick={submitCreate} disabled={saving || !formName.trim()}>
                {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Добавить', "Qo'shish")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {activation && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={() => setActivation(null)}>
          <Card className="w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-2 text-token-base font-semibold text-neutral-800">
              {tr('Устройство создано', 'Qurilma yaratildi')}: {activation.deviceName}
            </h3>
            <p className="text-token-sm text-neutral-600 mb-3">
              {tr(
                'Введите этот код на кассе для активации. Код показывается только один раз.',
                "Faollashtirish uchun bu kodni kassada kiriting. Kod faqat bir marta ko'rsatiladi."
              )}
            </p>
            <div className="rounded-token-md border border-neutral-200 bg-neutral-50 px-3 py-3 text-center font-mono text-token-lg tracking-wide text-neutral-800">
              {activation.code}
            </div>
            <p className="mt-2 text-token-xs text-neutral-500">
              {tr('Действителен до', 'Amal qilish muddati')}: {new Date(activation.expiresAt).toLocaleString(locale)}
            </p>
            <div className="flex justify-end mt-4">
              <Button variant="primary" size="md" type="button" onClick={() => setActivation(null)}>
                {tr('Закрыть', 'Yopish')}
              </Button>
            </div>
          </Card>
        </div>
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
          POS · {tr('Устройства', 'Qurilmalar')}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr('Кассовые устройства магазина и их подключение', "Do'kon kassa qurilmalari va ularning ulanishi")}
        </p>
      </div>
    </header>
  );
}
