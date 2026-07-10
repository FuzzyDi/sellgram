import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import {
  useB2bEnabled, B2bNotEnabled, B2bSubNav, B2bHeader,
  COUNTERPARTY_TYPES, COUNTERPARTY_TYPE_BADGE, debtClassName,
  type CounterpartyType,
} from './b2b-shared';

type NoticeTone = 'success' | 'error';

interface FormState {
  name: string;
  type: CounterpartyType;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  note: string;
}

function emptyForm(): FormState {
  return { name: '', type: 'INDIVIDUAL', phone: '', email: '', address: '', taxId: '', note: '' };
}

export default function B2bCounterparties() {
  const { tr, locale } = useAdminI18n();
  const navigate = useNavigate();
  const { enabled, checking, recheck } = useB2bEnabled();

  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  function typeLabel(type: string) {
    const found = COUNTERPARTY_TYPES.find((t) => t.value === type);
    return found ? tr(found.ru, found.uz) : type;
  }

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getCounterparties('pageSize=100');
      setCounterparties(Array.isArray(data?.items) ? data.items : []);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить контрагентов', "Kontragentlarni yuklab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (enabled) void load();
  }, [enabled]);

  function openCreate() {
    setForm(emptyForm());
    setFormOpen(true);
  }

  const canSave = useMemo(() => {
    if (!form.name.trim()) return false;
    if (form.type === 'ORGANIZATION' && !form.taxId.trim()) return false;
    return true;
  }, [form]);

  async function submitCreate() {
    if (!canSave) return;
    setSaving(true);
    try {
      await adminApi.createCounterparty({
        name: form.name.trim(),
        type: form.type,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        taxId: form.type === 'ORGANIZATION' ? form.taxId.trim() : undefined,
        note: form.note.trim() || undefined,
      });
      setFormOpen(false);
      showNotice('success', tr('Контрагент добавлен', "Kontragent qo'shildi"));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'name',
      header: tr('Имя', 'Ism'),
      render: (cp) => <span className="font-semibold text-neutral-800">{cp.name}</span>,
    },
    {
      key: 'type',
      header: tr('Тип', 'Turi'),
      render: (cp) => <Badge variant={COUNTERPARTY_TYPE_BADGE[cp.type as CounterpartyType] || 'neutral'}>{typeLabel(cp.type)}</Badge>,
    },
    {
      key: 'phone',
      header: tr('Телефон', 'Telefon'),
      render: (cp) => cp.phone || '—',
    },
    {
      key: 'currentDebt',
      header: tr('Долг', 'Qarz'),
      render: (cp) => (
        <span className={`font-semibold ${debtClassName(Number(cp.currentDebt))}`}>
          {Number(cp.currentDebt).toLocaleString(locale)}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: tr('Статус', 'Holat'),
      render: (cp) => (
        cp.isActive
          ? <Badge variant="success">{tr('Активен', 'Faol')}</Badge>
          : <Badge variant="neutral">{tr('Отключён', "O'chirilgan")}</Badge>
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

  if (checking) {
    return (
      <section className="flex flex-col gap-4">
        <div className="h-7 w-[35%] rounded-token-sm bg-neutral-100 animate-pulse" />
        <div className="h-32 rounded-token-lg bg-neutral-100 animate-pulse" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <B2bHeader tr={tr} title={tr('Контрагенты', 'Kontragentlar')} subtitle={tr('Оптовые покупатели и их долг', 'Optom xaridorlar va ularning qarzi')} />
      <B2bSubNav />

      {!enabled ? (
        <B2bNotEnabled onEnabled={recheck} />
      ) : (
        <>
          <div className="flex justify-end">
            <Button variant="primary" size="md" type="button" onClick={openCreate}>
              + {tr('Добавить контрагента', "Kontragent qo'shish")}
            </Button>
          </div>

          <Table
            columns={columns}
            data={counterparties}
            rowKey={(cp) => cp.id}
            onRowClick={(cp) => navigate(`/b2b/counterparties/${cp.id}`)}
            loading={loading}
            emptyMessage={tr('Контрагентов пока нет', "Hali kontragentlar yo'q")}
          />
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={() => !saving && setFormOpen(false)}>
          <Card className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-3 text-token-base font-semibold text-neutral-800">
              {tr('Новый контрагент', 'Yangi kontragent')}
            </h3>
            <div className="flex flex-col gap-3">
              <Input
                label={tr('Название / ФИО', "Nomi / F.I.Sh.")}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={tr('ООО «Ромашка»', '«Romashka» MChJ')}
              />
              <Select
                label={tr('Тип', 'Turi')}
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as CounterpartyType }))}
              >
                {COUNTERPARTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{tr(t.ru, t.uz)}</option>
                ))}
              </Select>
              {form.type === 'ORGANIZATION' && (
                <Input
                  label={tr('ИНН', 'STIR')}
                  value={form.taxId}
                  onChange={(e) => setForm((prev) => ({ ...prev, taxId: e.target.value }))}
                />
              )}
              <Input
                label={tr('Телефон', 'Telefon')}
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <Input
                label="Email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <Input
                label={tr('Адрес', 'Manzil')}
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-token-sm font-medium text-neutral-700">{tr('Заметка', 'Eslatma')}</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  rows={3}
                  className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="md" type="button" onClick={() => setFormOpen(false)} disabled={saving}>
                {tr('Отмена', 'Bekor')}
              </Button>
              <Button variant="primary" size="md" type="button" onClick={submitCreate} disabled={saving || !canSave}>
                {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
