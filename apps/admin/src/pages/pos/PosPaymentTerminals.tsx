import React, { useEffect, useMemo, useState } from 'react';
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

// docs/POS_SETTINGS_ARCHITECTURE.md §3 — the seven types this store's
// seed data and apps/api/src/modules/pos-sync/routes.ts's
// PAYMENT_TERMINAL_TYPE_TO_KEY both already use. `type` itself stays a
// free string server-side (no enum) — this is only the UI's known-value
// picker, not a validation ceiling; an admin cannot type an arbitrary
// value through this Select, but the backend would accept one if sent
// directly.
const TERMINAL_TYPES = ['CASH', 'CARD_PINPAD', 'QR_UZQR', 'QR_PAYME', 'QR_CLICK', 'QR_STATIC_MANUAL', 'BANK_TRANSFER'] as const;

const TERMINAL_TYPE_LABEL: Record<string, [string, string]> = {
  CASH: ['Наличные', 'Naqd'],
  CARD_PINPAD: ['Банковская карта', 'Bank kartasi'],
  QR_UZQR: ['UzQR', 'UzQR'],
  QR_PAYME: ['Payme', 'Payme'],
  QR_CLICK: ['Click', 'Click'],
  QR_STATIC_MANUAL: ['QR (статический)', 'QR (statik)'],
  BANK_TRANSFER: ['Перевод', "O'tkazma"],
};

// Badge has no "primary" variant (apps/admin/src/components/Badge.tsx —
// neutral/success/warning/danger/info only), so CARD_PINPAD's requested
// "primary" color maps to `info` (accent-colored), the closest existing
// variant, rather than adding a new one to the shared component for a
// single caller.
function typeBadgeVariant(type: string): BadgeVariant {
  if (type === 'CASH') return 'neutral';
  if (type === 'CARD_PINPAD') return 'info';
  if (type.startsWith('QR_')) return 'success';
  if (type === 'BANK_TRANSFER') return 'warning';
  return 'neutral';
}

function typeLabel(type: string, tr: (ru: string, uz: string) => string) {
  const found = TERMINAL_TYPE_LABEL[type];
  return found ? tr(...found) : type;
}

interface FormState {
  name: string;
  type: string;
  enabled: boolean;
  sortOrder: string;
  // JSON text, edited as raw JSON same as PosSettings.tsx's eight
  // settings panels — config is provider-specific and unconstrained
  // server-side (docs/POS_SETTINGS_ARCHITECTURE.md §3.2). Loaded
  // straight from GET /payment-terminals, which already masks
  // apiKey/key/secret/password/token to "••••••"
  // (admin-routes.ts maskSecrets()) — this textarea never sees a real
  // secret value. If the admin leaves a masked "••••••" untouched, the
  // server preserves the real stored value for that key on save rather
  // than overwriting it with the literal placeholder string (PATCH
  // /payment-terminals/:id's merge step) — if they type a new value
  // over it, that new value is what gets saved. Either way this
  // component just sends whatever JSON is in the box; it does no
  // masking/diffing of its own.
  config: string;
  // '' = store default (deviceId: null on save); a device id = override
  // for that one till (docs/POS_SETTINGS_ARCHITECTURE.md §3/§4).
  deviceId: string;
}

function emptyForm(): FormState {
  return { name: '', type: 'CASH', enabled: true, sortOrder: '0', config: '{}', deviceId: '' };
}

export default function PosPaymentTerminals() {
  const { tr } = useAdminI18n();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [devices, setDevices] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [loadingTerminals, setLoadingTerminals] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [configError, setConfigError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function loadTerminals(targetStoreId: string) {
    if (!targetStoreId) return;
    setLoadingTerminals(true);
    try {
      const list = await adminApi.getPaymentTerminals(targetStoreId);
      setTerminals(Array.isArray(list) ? list : []);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить терминалы', "Terminallarni yuklab bo'lmadi"));
      }
      setTerminals([]);
    } finally {
      setLoadingTerminals(false);
    }
  }

  useEffect(() => {
    if (storeId) void loadTerminals(storeId);
  }, [storeId]);

  useEffect(() => {
    if (!storeId) { setDevices([]); return; }
    adminApi.getPosDevices(storeId).then((list: any) => setDevices(Array.isArray(list) ? list : [])).catch(() => setDevices([]));
  }, [storeId]);

  const deviceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of devices) map.set(d.id, d.name);
    return map;
  }, [devices]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setConfigError(null);
    setFormOpen(true);
  }

  function openEdit(terminal: any) {
    setEditId(terminal.id);
    setForm({
      name: terminal.name,
      type: terminal.type,
      enabled: terminal.enabled,
      sortOrder: String(terminal.sortOrder ?? 0),
      config: JSON.stringify(terminal.config ?? {}, null, 2),
      deviceId: terminal.deviceId || '',
    });
    setConfigError(null);
    setFormOpen(true);
  }

  const canSave = useMemo(() => form.name.trim().length > 0, [form.name]);

  async function submitForm() {
    if (!canSave || !storeId) return;

    let config: Record<string, unknown>;
    try {
      const raw = form.config.trim();
      config = raw === '' ? {} : JSON.parse(raw);
      if (Array.isArray(config) || typeof config !== 'object' || config === null) throw new Error('expected object');
    } catch {
      setConfigError(tr('Ожидается JSON-объект, например {}', "JSON obyekt kutilmoqda, masalan {}"));
      return;
    }
    setConfigError(null);

    const sortOrder = Number.parseInt(form.sortOrder, 10);

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        enabled: form.enabled,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        config,
        deviceId: form.deviceId || null,
      };

      if (editId) {
        await adminApi.updatePaymentTerminal(editId, payload);
        showNotice('success', tr('Терминал обновлён', 'Terminal yangilandi'));
      } else {
        await adminApi.createPaymentTerminal({ storeId, ...payload });
        showNotice('success', tr('Терминал добавлен', "Terminal qo'shildi"));
      }
      setFormOpen(false);
      await loadTerminals(storeId);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(terminal: any) {
    if (!storeId) return;
    try {
      await adminApi.updatePaymentTerminal(terminal.id, { enabled: !terminal.enabled });
      await loadTerminals(storeId);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function removeTerminal(id: string) {
    if (!storeId) return;
    setPendingDelete(null);
    setSaving(true);
    try {
      await adminApi.deletePaymentTerminal(id);
      showNotice('success', tr('Терминал удалён', "Terminal o'chirildi"));
      await loadTerminals(storeId);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'name',
      header: tr('Название', 'Nomi'),
      render: (t) => (
        <div>
          <span className="font-semibold text-neutral-800">{t.name}</span>
          <div className="text-token-xs text-neutral-400">
            {t.deviceId
              ? `${tr('Касса', 'Kassa')}: ${deviceNameById.get(t.deviceId) || t.deviceId}`
              : tr('Магазин (по умолчанию)', "Do'kon (standart)")}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: tr('Тип', 'Turi'),
      render: (t) => <Badge variant={typeBadgeVariant(t.type)}>{typeLabel(t.type, tr)}</Badge>,
    },
    {
      key: 'enabled',
      header: tr('Статус', 'Holat'),
      render: (t) => (
        t.enabled
          ? <Badge variant="success">{tr('Включён', 'Yoqilgan')}</Badge>
          : <Badge variant="neutral">{tr('Отключён', "O'chirilgan")}</Badge>
      ),
    },
    {
      key: 'actions',
      header: tr('Действия', 'Amallar'),
      render: (t) => (
        pendingDelete === t.id ? (
          <div className="flex gap-1.5 items-center">
            <span className="text-token-xs text-neutral-600">{tr('Удалить?', "O'chirilsinmi?")}</span>
            <Button variant="danger" size="sm" type="button" onClick={() => removeTerminal(t.id)}>{tr('Да', 'Ha')}</Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setPendingDelete(null)}>{tr('Нет', "Yo'q")}</Button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" type="button" onClick={() => openEdit(t)}>{tr('Изменить', 'Tahrirlash')}</Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => void toggleEnabled(t)}>
              {t.enabled ? tr('Выключить', "O'chirish") : tr('Включить', 'Yoqish')}
            </Button>
            <Button variant="danger" size="sm" type="button" onClick={() => setPendingDelete(t.id)}>{tr('Удалить', "O'chirish")}</Button>
          </div>
        )
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
          <div className="flex justify-end">
            <Button variant="primary" size="md" type="button" onClick={openCreate}>
              + {tr('Добавить терминал', "Terminal qo'shish")}
            </Button>
          </div>

          <Table
            columns={columns}
            data={terminals}
            rowKey={(t) => t.id}
            loading={loadingTerminals}
            emptyMessage={tr('Терминалов пока нет', "Hali terminallar yo'q")}
          />
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={() => !saving && setFormOpen(false)}>
          <Card className="w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-3 text-token-base font-semibold text-neutral-800">
              {editId ? tr('Изменить терминал', 'Terminalni tahrirlash') : tr('Новый терминал', 'Yangi terminal')}
            </h3>
            <div className="flex flex-col gap-3">
              <Input
                label={tr('Название', 'Nomi')}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={tr('Основной терминал UzQR', 'Asosiy UzQR terminal')}
              />
              <Select
                label={tr('Тип', 'Turi')}
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                {TERMINAL_TYPES.map((type) => (
                  <option key={type} value={type}>{typeLabel(type, tr)}</option>
                ))}
              </Select>
              <Select
                label={tr('Касса', 'Kassa')}
                value={form.deviceId}
                onChange={(e) => setForm((prev) => ({ ...prev, deviceId: e.target.value }))}
              >
                <option value="">{tr('Магазин (по умолчанию)', "Do'kon (standart)")}</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Input
                label={tr('Порядок сортировки', 'Saralash tartibi')}
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
              />

              <label className="flex items-center gap-2 text-token-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                {tr('Включён', 'Yoqilgan')}
              </label>

              <div>
                <label className="block text-token-sm font-medium text-neutral-700 mb-1.5">
                  Config (JSON)
                </label>
                <p className="m-0 mb-1.5 text-token-xs text-neutral-500">
                  {tr(
                    'apiKey/key/secret/password/token показываются как ••••••. Если оставить без изменений — сохранится прежнее значение.',
                    "apiKey/key/secret/password/token maydonlari ••••••  ko'rinishida ko'rsatiladi. O'zgartirilmasa — avvalgi qiymat saqlanadi."
                  )}
                </p>
                <textarea
                  value={form.config}
                  onChange={(e) => setForm((prev) => ({ ...prev, config: e.target.value }))}
                  rows={8}
                  spellCheck={false}
                  className={[
                    'w-full rounded-token-md border px-3 py-2 text-token-xs font-mono text-neutral-800 bg-white',
                    'focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500',
                    configError ? 'border-danger' : 'border-neutral-300',
                  ].join(' ')}
                />
                {configError && <p className="m-0 mt-1 text-token-xs text-danger">{configError}</p>}
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="md" type="button" onClick={() => setFormOpen(false)} disabled={saving}>
                {tr('Отмена', 'Bekor')}
              </Button>
              <Button variant="primary" size="md" type="button" onClick={submitForm} disabled={saving || !canSave}>
                {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
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
          POS · {tr('Способы оплаты', "To'lov usullari")}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr(
            'Платёжные терминалы магазина — по умолчанию для всех касс или переопределение для конкретной кассы',
            "Do'kon to'lov terminallari — barcha kassalar uchun standart yoki bitta kassa uchun o'zgartirish"
          )}
        </p>
      </div>
    </header>
  );
}
