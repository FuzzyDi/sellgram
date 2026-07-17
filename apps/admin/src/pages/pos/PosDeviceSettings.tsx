import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import {
  usePosStores, isPlanBlockedError, PosPlanBlocked, PosSubNav, PosStoreSelect,
} from './pos-shared';

type NoticeTone = 'success' | 'error';
type SectionKey = 'printer' | 'scanner' | 'pinPad' | 'scale' | 'display';

interface FieldOption {
  value: string;
  label: [string, string];
}

interface FieldSpec {
  key: string;
  label: [string, string];
  type: 'text' | 'number' | 'select';
  options?: FieldOption[];
}

interface SectionSpec {
  key: SectionKey;
  title: [string, string];
  fields: FieldSpec[];
}

// docs/POS_SETTINGS_ARCHITECTURE.md §6 — field shapes as given in the
// PosDeviceSettings schema comments. printer's fields mirror
// PosSettings.payload.printerProfile's existing shape (type/host/port/
// charset/paperWidth — "moving house, not changing shape" per §6);
// scanner/pinPad/scale/display have no prior shape to inherit, so their
// field lists here are this UI's own first cut, not a confirmed
// contract — same "shape settles with real usage" status §6 itself
// gives these four.
const SECTIONS: SectionSpec[] = [
  {
    key: 'printer',
    title: ['Принтер чеков', 'Chek printeri'],
    fields: [
      {
        key: 'type', label: ['Тип', 'Turi'], type: 'select',
        options: [
          { value: 'THERMAL', label: ['Термо', 'Termo'] },
          { value: 'MATRIX', label: ['Матричный', 'Matritsali'] },
        ],
      },
      { key: 'host', label: ['Host', 'Host'], type: 'text' },
      { key: 'port', label: ['Порт', 'Port'], type: 'text' },
      { key: 'charset', label: ['Кодировка', 'Kodlash'], type: 'text' },
      { key: 'paperWidth', label: ['Ширина ленты (мм)', 'Lenta kengligi (mm)'], type: 'number' },
    ],
  },
  {
    key: 'scanner',
    title: ['Сканер ШК', 'Shtrix-kod skaneri'],
    fields: [
      { key: 'port', label: ['COM-порт', 'COM-port'], type: 'text' },
      { key: 'baudRate', label: ['Скорость (baud)', 'Tezlik (baud)'], type: 'number' },
      { key: 'protocol', label: ['Протокол', 'Protokol'], type: 'text' },
    ],
  },
  {
    key: 'pinPad',
    title: ['Пин-пад', 'Pin-pad'],
    fields: [
      {
        key: 'protocol', label: ['Протокол', 'Protokol'], type: 'select',
        options: [
          { value: 'NEXGO', label: ['NEXGO', 'NEXGO'] },
          { value: 'PAX', label: ['PAX', 'PAX'] },
          { value: 'INGENICO', label: ['INGENICO', 'INGENICO'] },
        ],
      },
      { key: 'port', label: ['Порт', 'Port'], type: 'text' },
      { key: 'baudRate', label: ['Скорость (baud)', 'Tezlik (baud)'], type: 'number' },
      { key: 'timeout', label: ['Таймаут (сек)', 'Timeout (soniya)'], type: 'number' },
    ],
  },
  {
    key: 'scale',
    title: ['Весы', 'Tarozi'],
    fields: [
      { key: 'port', label: ['Порт', 'Port'], type: 'text' },
      { key: 'baudRate', label: ['Скорость (baud)', 'Tezlik (baud)'], type: 'number' },
      { key: 'protocol', label: ['Протокол', 'Protokol'], type: 'text' },
      { key: 'barcodePrefix', label: ['Префикс ШК', 'Shtrix-kod prefiksi'], type: 'text' },
    ],
  },
  {
    key: 'display',
    title: ['Покупательский дисплей', 'Xaridor displeyi'],
    fields: [
      { key: 'type', label: ['Тип', 'Turi'], type: 'text' },
      { key: 'port', label: ['Порт', 'Port'], type: 'text' },
      { key: 'lines', label: ['Кол-во строк', 'Qatorlar soni'], type: 'number' },
    ],
  },
];

function emptyFieldValues(section: SectionSpec): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of section.fields) values[field.key] = field.type === 'select' ? (field.options?.[0]?.value ?? '') : '';
  return values;
}

function toFieldValues(section: SectionSpec, stored: any): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of section.fields) {
    const raw = stored?.[field.key];
    values[field.key] = raw === undefined || raw === null ? '' : String(raw);
  }
  return values;
}

function toPayload(section: SectionSpec, values: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of section.fields) {
    const raw = values[field.key];
    if (raw === '' || raw === undefined) continue;
    payload[field.key] = field.type === 'number' ? Number(raw) : raw;
  }
  return payload;
}

function HardwareSection({ section, stored, saving, onSave, tr }: {
  section: SectionSpec;
  stored: any;
  saving: boolean;
  onSave: (section: SectionKey, payload: Record<string, unknown>) => void;
  tr: (ru: string, uz: string) => string;
}) {
  const [configuring, setConfiguring] = useState(stored != null);
  const [values, setValues] = useState<Record<string, string>>(
    stored != null ? toFieldValues(section, stored) : emptyFieldValues(section)
  );

  useEffect(() => {
    setConfiguring(stored != null);
    setValues(stored != null ? toFieldValues(section, stored) : emptyFieldValues(section));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  if (!configuring) {
    return (
      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="m-0 font-semibold text-token-sm text-neutral-800">{tr(...section.title)}</p>
          <p className="m-0 mt-0.5 text-token-xs text-neutral-500">{tr('Не настроено', "Sozlanmagan")}</p>
        </div>
        <Button variant="ghost" size="sm" type="button" onClick={() => setConfiguring(true)}>
          {tr('Настроить', 'Sozlash')}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="m-0 font-semibold text-token-sm text-neutral-800">{tr(...section.title)}</p>
      <div className="grid grid-cols-2 gap-3">
        {section.fields.map((field) => (
          field.type === 'select' ? (
            <Select
              key={field.key}
              label={tr(...field.label)}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
            >
              {(field.options ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>{tr(...opt.label)}</option>
              ))}
            </Select>
          ) : (
            <Input
              key={field.key}
              label={tr(...field.label)}
              type={field.type === 'number' ? 'number' : 'text'}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
            />
          )
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          type="button"
          disabled={saving}
          onClick={() => onSave(section.key, toPayload(section, values))}
        >
          {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
        </Button>
      </div>
    </Card>
  );
}

export default function PosDeviceSettings() {
  const { tr } = useAdminI18n();
  const { stores, storeId, selectStore, loading: storesLoading, loadError: storesError } = usePosStores();

  const [devices, setDevices] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [settings, setSettings] = useState<any | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  useEffect(() => {
    if (!storeId) { setDevices([]); return; }
    adminApi.getPosDevices(storeId)
      .then((list: any) => {
        const normalized = Array.isArray(list) ? list : [];
        setDevices(normalized);
        setDeviceId((prev) => (normalized.some((d: any) => d.id === prev) ? prev : normalized[0]?.id ?? ''));
      })
      .catch(() => setDevices([]));
  }, [storeId]);

  async function loadSettings(targetDeviceId: string) {
    if (!targetDeviceId) { setSettings(null); return; }
    setLoadingSettings(true);
    try {
      const data = await adminApi.getPosDeviceSettings(targetDeviceId);
      setSettings(data);
      setPlanBlocked(false);
    } catch (err: any) {
      if (isPlanBlockedError(err)) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Не удалось загрузить настройки', "Sozlamalarni yuklab bo'lmadi"));
      }
      setSettings(null);
    } finally {
      setLoadingSettings(false);
    }
  }

  useEffect(() => {
    if (deviceId) void loadSettings(deviceId);
  }, [deviceId]);

  async function saveSection(section: SectionKey, payload: Record<string, unknown>) {
    if (!deviceId) return;
    setSavingSection(section);
    try {
      const result = await adminApi.updatePosDeviceSettings(deviceId, { [section]: payload });
      setSettings(result);
      showNotice('success', tr('Сохранено', 'Saqlandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSavingSection(null);
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
      ) : devices.length === 0 ? (
        <Card className="text-center py-8 px-4">
          <p className="text-token-sm text-neutral-500">
            {tr('В этом магазине пока нет касс.', "Bu do'konda hali kassalar yo'q.")}
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <label className="block text-token-sm font-medium text-neutral-700 mb-1.5">
              {tr('Касса', 'Kassa')}
            </label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
            >
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Card>

          {loadingSettings ? (
            <div className="h-64 rounded-token-lg bg-neutral-100 animate-pulse" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {SECTIONS.map((section) => (
                <HardwareSection
                  key={section.key}
                  section={section}
                  stored={settings?.[section.key] ?? null}
                  saving={savingSection === section.key}
                  onSave={saveSection}
                  tr={tr}
                />
              ))}
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
          POS · {tr('Оборудование', 'Uskunalar')}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">
          {tr(
            'Профили оборудования кассы: принтер, сканер, пин-пад, весы, дисплей',
            'Kassa uskunalari profillari: printer, skaner, pin-pad, tarozi, displey'
          )}
        </p>
      </div>
    </header>
  );
}
