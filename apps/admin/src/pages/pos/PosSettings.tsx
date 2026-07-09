import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import {
  usePosStores, isPlanBlockedError, PosPlanBlocked, PosSubNav, PosStoreSelect,
} from './pos-shared';

type NoticeTone = 'success' | 'error';

// The eight-key POS settings document (docs/POS_SYNC_API.md §10). Nested
// shapes are intentionally unconstrained by the API — taxProfile/
// receiptTemplate/printerProfile/fiscalProfile depend on a fiscal
// integration partner not yet confirmed, so this form edits each key as
// raw JSON rather than fabricating structured fields the backend doesn't
// actually validate.
const SETTINGS_FIELDS: {
  key: string;
  isArray?: boolean;
  ru: string; uz: string;
  hintRu: string; hintUz: string;
}[] = [
  {
    key: 'taxProfile', ru: 'Налоговый профиль', uz: 'Soliq profili',
    hintRu: 'Ставки НДС и налоговые правила для устройств этого магазина.',
    hintUz: "Ushbu do'kon qurilmalari uchun QQS stavkalari va soliq qoidalari.",
  },
  {
    key: 'paymentMethods', isArray: true, ru: 'Способы оплаты', uz: "To'lov usullari",
    hintRu: 'Список способов оплаты, доступных на кассе.',
    hintUz: "Kassada mavjud bo'lgan to'lov usullari ro'yxati.",
  },
  {
    key: 'receiptTemplate', ru: 'Шаблон чека', uz: 'Chek shabloni',
    hintRu: 'Оформление и содержимое печатаемого чека.',
    hintUz: 'Chop etiladigan chekning tuzilishi va mazmuni.',
  },
  {
    key: 'printerProfile', ru: 'Профиль принтера', uz: 'Printer profili',
    hintRu: 'Параметры чекового принтера устройства.',
    hintUz: 'Qurilma chek printeri sozlamalari.',
  },
  {
    key: 'fiscalProfile', ru: 'Фискальный профиль', uz: 'Fiskal profil',
    hintRu: 'Настройки интеграции с фискальным модулем.',
    hintUz: 'Fiskal modul integratsiyasi sozlamalari.',
  },
  {
    key: 'offlineLimits', ru: 'Офлайн-лимиты', uz: 'Oflayn cheklovlar',
    hintRu: 'Сколько часов/на какую сумму устройство может продавать офлайн до обязательной синхронизации.',
    hintUz: "Majburiy sinxronizatsiyagacha qurilma necha soat/qancha summaga oflayn sotishi mumkinligi.",
  },
  {
    key: 'roundingRules', ru: 'Правила округления', uz: 'Yaxlitlash qoidalari',
    hintRu: 'Правила округления суммы при наличной оплате.',
    hintUz: "Naqd to'lovda summani yaxlitlash qoidalari.",
  },
  {
    key: 'featureFlags', ru: 'Флаги функций', uz: 'Funksiya bayroqlari',
    hintRu: 'Произвольный набор флагов для поэтапного включения новых возможностей POS.',
    hintUz: 'POS-ning yangi imkoniyatlarini bosqichma-bosqich yoqish uchun erkin bayroqlar to’plami.',
  },
];

function defaultValue(isArray?: boolean) {
  return isArray ? [] : {};
}

export default function PosSettings() {
  const { tr, locale } = useAdminI18n();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [loadingSettings, setLoadingSettings] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function loadSettings(targetStoreId: string) {
    if (!targetStoreId) return;
    setLoadingSettings(true);
    try {
      const data = await adminApi.getPosSettings(targetStoreId);
      const payload = data?.payload || {};
      const nextValues: Record<string, string> = {};
      for (const field of SETTINGS_FIELDS) {
        nextValues[field.key] = JSON.stringify(payload[field.key] ?? defaultValue(field.isArray), null, 2);
      }
      setValues(nextValues);
      setErrors({});
      setVersion(data?.version ?? null);
      setUpdatedAt(data?.updatedAt ?? null);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить настройки', "Sozlamalarni yuklab bo'lmadi"));
      }
    } finally {
      setLoadingSettings(false);
    }
  }

  useEffect(() => {
    if (storeId) void loadSettings(storeId);
  }, [storeId]);

  async function submit() {
    if (!storeId) return;
    const parsed: Record<string, unknown> = {};
    const nextErrors: Record<string, string> = {};

    for (const field of SETTINGS_FIELDS) {
      const raw = values[field.key] ?? '';
      try {
        const value = raw.trim() === '' ? defaultValue(field.isArray) : JSON.parse(raw);
        const isArrayValue = Array.isArray(value);
        if (field.isArray && !isArrayValue) throw new Error('expected array');
        if (!field.isArray && (isArrayValue || typeof value !== 'object' || value === null)) throw new Error('expected object');
        parsed[field.key] = value;
      } catch {
        nextErrors[field.key] = field.isArray
          ? tr('Ожидается JSON-массив, например []', "JSON massiv kutilmoqda, masalan []")
          : tr('Ожидается JSON-объект, например {}', "JSON obyekt kutilmoqda, masalan {}");
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showNotice('error', tr('Проверьте JSON в полях с ошибками', "Xatoli maydonlardagi JSON'ni tekshiring"));
      return;
    }

    setSaving(true);
    try {
      const result = await adminApi.updatePosSettings(storeId, parsed as any);
      setVersion(result.version);
      setUpdatedAt(result.updatedAt);
      showNotice('success', tr('Настройки сохранены', 'Sozlamalar saqlandi'));
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
      }
    } finally {
      setSaving(false);
    }
  }

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
      ) : loadingSettings ? (
        <div className="h-64 rounded-token-lg bg-neutral-100 animate-pulse" />
      ) : (
        <>
          <Card className="flex items-center justify-between flex-wrap gap-2">
            <p className="m-0 text-token-sm text-neutral-500">
              {tr('Версия', 'Versiya')}: {version ?? '—'}
              {updatedAt && <> · {tr('Обновлено', 'Yangilangan')}: {new Date(updatedAt).toLocaleString(locale)}</>}
            </p>
            <Button variant="primary" size="md" type="button" onClick={submit} disabled={saving}>
              {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить настройки', 'Sozlamalarni saqlash')}
            </Button>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {SETTINGS_FIELDS.map((field) => (
              <Card key={field.key} className="flex flex-col gap-1.5">
                <label className="text-token-sm font-medium text-neutral-700">{tr(field.ru, field.uz)}</label>
                <p className="m-0 text-token-xs text-neutral-500">{tr(field.hintRu, field.hintUz)}</p>
                <textarea
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  rows={6}
                  spellCheck={false}
                  className={[
                    'w-full rounded-token-md border px-3 py-2 text-token-xs font-mono text-neutral-800 bg-white',
                    'focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500',
                    errors[field.key] ? 'border-danger' : 'border-neutral-300',
                  ].join(' ')}
                />
                {errors[field.key] && <p className="m-0 text-token-xs text-danger">{errors[field.key]}</p>}
              </Card>
            ))}
          </div>
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
          POS · {tr('Настройки', 'Sozlamalar')}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr('Единый документ настроек POS для магазина', "Do'kon uchun yagona POS sozlamalari hujjati")}
        </p>
      </div>
    </header>
  );
}
