import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/store-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Select from '../../components/Select';

type ReportsLimits = {
  planCode?: string;
  reportsLevel?: string;
  reportsHistoryDays?: number;
  allowReportExport?: boolean;
  maxReportsPerMonth?: number;
  maxScheduledReports?: number;
  maxExportsPerMonth?: number;
};

type ScheduledFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type ScheduledReportDraft = {
  reportType: string;
  periodDays: number;
  frequency: ScheduledFrequency;
};

export default function ScheduledReportsSection({
  limits,
  tr,
}: {
  limits: ReportsLimits | undefined;
  tr: (ru: string, uz: string) => string;
}) {
  const navigate = useNavigate();
  const maxAllowed = limits?.maxScheduledReports ?? 0;
  const [schedules, setSchedules] = useState<(ScheduledReportDraft & { id: string; nextRunAt?: string; lastSentAt?: string | null })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<ScheduledReportDraft>({
    reportType: 'top-products',
    periodDays: 30,
    frequency: 'WEEKLY',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (maxAllowed === 0) return;
    adminApi.getScheduledReports()
      .then((data: any[]) => setSchedules(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true));
  }, [maxAllowed]);

  const canAdd = maxAllowed < 0 || schedules.length < maxAllowed;

  async function addSchedule() {
    if (!canAdd || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const created = await adminApi.createScheduledReport(draft);
      setSchedules((prev) => [...prev, created]);
      setShowForm(false);
    } catch (err: any) {
      setSaveError(err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule(id: string) {
    try {
      await adminApi.deleteScheduledReport(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setSaveError(err?.message || tr('Ошибка удаления', "O'chirishda xato"));
    }
  }

  const frequencyLabel: Record<ScheduledFrequency, string> = {
    DAILY:   tr('Каждый день', 'Har kuni'),
    WEEKLY:  tr('Каждую неделю', 'Har hafta'),
    MONTHLY: tr('Каждый месяц', 'Har oy'),
  };

  const reportTypeLabel: Record<string, string> = {
    'top-products': tr('Топ товаров', 'Top mahsulotlar'),
    'revenue':      tr('Выручка', 'Tushum'),
    'categories':   tr('Категории', 'Toifalar'),
    'customers':    tr('Клиенты', 'Mijozlar'),
  };

  if (maxAllowed === 0) {
    return (
      <Card>
        <h3 className="m-0 mb-2 text-token-lg font-semibold text-neutral-800">
          {tr('Авто-рассылка отчётов', 'Hisobotlarni avtomatik yuborish')}
        </h3>
        <div className="py-5 px-4 bg-neutral-50 border border-neutral-200 rounded-token-lg text-center">
          <div className="text-token-2xl mb-2">🔒</div>
          <p className="m-0 font-semibold text-token-base text-neutral-800">
            {tr('Доступно на PRO и BUSINESS', 'PRO va BUSINESS tariflarida mavjud')}
          </p>
          <p className="mt-1 text-token-sm text-neutral-500">
            {tr(
              'Автоматически отправляйте CSV-отчёты по расписанию на email',
              'CSV hisobotlarni jadval bo`yicha email ga avtomatik yuboring'
            )}
          </p>
          <Button variant="primary" size="md" type="button" className="mt-3" onClick={() => navigate('/billing')}>
            {tr('Перейти к тарифам', "Tariflarga o'tish")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2.5 mb-3">
        <div>
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">
            {tr('Авто-рассылка отчётов', 'Hisobotlarni avtomatik yuborish')}
          </h3>
          <p className="mt-0.5 text-token-sm text-neutral-500">
            {tr('Отчёты по расписанию на email', 'Email ga jadval bo`yicha hisobotlar')}
            {maxAllowed > 0 && (
              <span className="ml-2 font-medium">
                ({schedules.length}/{maxAllowed})
              </span>
            )}
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          type="button"
          className="whitespace-nowrap"
          onClick={() => setShowForm(true)}
          disabled={!canAdd || showForm}
        >
          + {tr('Добавить', "Qo'shish")}
        </Button>
      </div>

      {showForm && (
        <div className="border border-neutral-200 rounded-token-lg p-3.5 mb-3 bg-neutral-50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
            <Select
              label={tr('Тип отчёта', 'Hisobot turi')}
              value={draft.reportType}
              onChange={(e) => setDraft((d) => ({ ...d, reportType: e.target.value }))}
            >
              {Object.entries(reportTypeLabel).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
            <Select
              label={tr('Период (дней)', 'Davr (kun)')}
              value={draft.periodDays}
              onChange={(e) => setDraft((d) => ({ ...d, periodDays: Number(e.target.value) }))}
            >
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>{d} {tr('дней', 'kun')}</option>
              ))}
            </Select>
            <Select
              label={tr('Частота', 'Chastota')}
              value={draft.frequency}
              onChange={(e) => setDraft((d) => ({ ...d, frequency: e.target.value as ScheduledFrequency }))}
            >
              {(Object.keys(frequencyLabel) as ScheduledFrequency[]).map((key) => (
                <option key={key} value={key}>{frequencyLabel[key]}</option>
              ))}
            </Select>
          </div>
          {saveError && (
            <p className="m-0 mb-2 text-token-sm font-medium text-danger">{saveError}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="md" type="button" onClick={() => { setShowForm(false); setSaveError(''); }}>{tr('Отмена', 'Bekor')}</Button>
            <Button variant="primary" size="md" type="button" onClick={() => void addSchedule()} disabled={saving}>
              {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
            </Button>
          </div>
        </div>
      )}

      {schedules.length === 0 && !showForm ? (
        <p className="text-token-sm text-neutral-500">{tr('Нет запланированных отчётов', 'Rejalashtirilgan hisobotlar yo`q')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {loadError && (
            <p className="text-token-sm text-danger">{tr('Не удалось загрузить расписания', 'Jadvallarni yuklab bo`lmadi')}</p>
          )}
          {saveError && !showForm && (
            <p className="m-0 text-token-sm font-medium text-danger">{saveError}</p>
          )}
          {schedules.map((s) => (
            <Card key={s.id} className="bg-neutral-50 flex items-center justify-between gap-3" style={{ padding: '10px 14px' }}>
              <div>
                <span className="font-semibold text-token-sm text-neutral-800">{reportTypeLabel[s.reportType] || s.reportType}</span>
                <span className="ml-2.5 text-token-sm text-neutral-500">
                  {frequencyLabel[s.frequency]} · {s.periodDays} {tr('дней', 'kun')}
                </span>
                {s.nextRunAt && (
                  <span className="ml-2.5 text-token-xs text-neutral-500">
                    {tr('Следующая', 'Keyingisi')}: {new Date(s.nextRunAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <Button variant="danger" size="sm" type="button" onClick={() => void removeSchedule(s.id)}>
                {tr('Удалить', "O'chirish")}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
