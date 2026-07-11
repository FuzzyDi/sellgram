import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import PaymentMethodFormModal from '../components/payments/payment-method-form-modal';
import {
  buildPaymentMethodPayload,
  emptyPaymentMethodForm,
  formFromMethod,
  FormState,
  PROVIDER_DEFAULTS,
  ProviderCode,
} from '../components/payments/payment-method-model';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Select from '../components/Select';
import Badge from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';

export default function PaymentMethods() {
  const { tr, lang } = useAdminI18n();
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [methods, setMethods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<FormState>(emptyPaymentMethodForm(0));
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  function showNotice(tone: 'success' | 'error', message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function loadStores() {
    const list = await adminApi.getStores();
    const normalized = Array.isArray(list) ? list : [];
    setStores(normalized);
    if (!storeId && normalized[0]?.id) setStoreId(normalized[0].id);
  }

  async function loadMethods(targetStoreId: string) {
    if (!targetStoreId) return;
    try {
      const list = await adminApi.getStorePaymentMethods(targetStoreId);
      setMethods(Array.isArray(list) ? list : []);
    } catch {
      setMethods([]);
      showNotice('error', tr('Не удалось загрузить методы оплаты', "To'lov usullarini yuklab bo'lmadi"));
    }
  }

  async function bootstrap() {
    setLoading(true);
    setLoadError(false);
    try {
      await loadStores();
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (storeId) loadMethods(storeId);
  }, [storeId]);

  const canSave = useMemo(() => form.code.trim() && form.title.trim(), [form.code, form.title]);

  function applyProviderDefaults(provider: ProviderCode) {
    const defaults = PROVIDER_DEFAULTS[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      code: !prev.code || prev.code === PROVIDER_DEFAULTS[prev.provider].code ? defaults.code : prev.code,
      title:
        !prev.title ||
        prev.title === PROVIDER_DEFAULTS[prev.provider].titleRu ||
        prev.title === PROVIDER_DEFAULTS[prev.provider].titleUz
          ? lang === 'uz'
            ? defaults.titleUz
            : defaults.titleRu
          : prev.title,
    }));
  }

  function openCreate() {
    setEditing(null);
    const next = emptyPaymentMethodForm(methods.length);
    setForm({
      ...next,
      code: PROVIDER_DEFAULTS[next.provider].code,
      title: lang === 'uz' ? PROVIDER_DEFAULTS[next.provider].titleUz : PROVIDER_DEFAULTS[next.provider].titleRu,
    });
    setFormOpen(true);
  }

  function openEdit(method: any) {
    setEditing(method);
    setForm(formFromMethod(method));
    setFormOpen(true);
  }

  async function saveMethod() {
    if (!canSave || !storeId) return;
    setSaving(true);
    try {
      const payload = buildPaymentMethodPayload(form, tr);
      if (editing) {
        await adminApi.updateStorePaymentMethod(storeId, editing.id, payload);
      } else {
        await adminApi.createStorePaymentMethod(storeId, payload);
      }
      setFormOpen(false);
      await loadMethods(storeId);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  async function archiveMethod(methodId: string) {
    setPendingArchive(null);
    try {
      await adminApi.deleteStorePaymentMethod(storeId, methodId);
      await loadMethods(storeId);
      showNotice('success', tr('Способ оплаты архивирован', "To'lov usuli arxivlandi"));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
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

  const columns: TableColumn<any>[] = [
    {
      key: 'title',
      header: tr('Название', 'Nomi'),
      render: (method) => (
        <div>
          <div className="font-semibold text-neutral-800">{method.title}</div>
          {method.description && <div className="text-token-xs text-neutral-500">{method.description}</div>}
        </div>
      ),
    },
    { key: 'provider', header: 'Provider', render: (method) => method.provider },
    { key: 'code', header: 'Code', render: (method) => method.code },
    {
      key: 'flags',
      header: tr('Флаги', 'Holat'),
      render: (method) => (
        <div className="flex gap-1.5 flex-wrap">
          <Badge variant={method.isActive ? 'success' : 'neutral'}>
            {method.isActive ? tr('Активен', 'Faol') : tr('Отключен', "O'chirilgan")}
          </Badge>
          {method.isDefault && <Badge variant="info">{tr('По умолчанию', 'Asosiy')}</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: tr('Действия', 'Amallar'),
      render: (method) => (
        pendingArchive === method.id ? (
          <div className="flex gap-1.5 items-center">
            <span className="text-token-xs text-neutral-600">{tr('Удалить?', "O'chirish?")}</span>
            <Button variant="danger" size="sm" type="button" onClick={() => archiveMethod(method.id)}>
              {tr('Да', 'Ha')}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setPendingArchive(null)}>
              {tr('Нет', "Yo'q")}
            </Button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" type="button" onClick={() => openEdit(method)}>
              {tr('Изменить', 'Tahrirlash')}
            </Button>
            <Button variant="danger" size="sm" type="button" onClick={() => setPendingArchive(method.id)}>
              {tr('Архив', 'Arxiv')}
            </Button>
          </div>
        )
      ),
    },
  ];

  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <div className="h-9 w-[30%] rounded-token-sm bg-neutral-100 animate-pulse" />
        <div className="h-5 w-[55%] rounded-token-sm bg-neutral-100 animate-pulse" />
        <div className="h-[120px] rounded-token-lg bg-neutral-100 animate-pulse" />
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Способы оплаты', "To'lov usullari")}</h2>
        </header>
        <Card className="text-center py-8 px-4">
          <p className="m-0 font-semibold text-danger">{tr('Не удалось загрузить данные', "Ma'lumotlarni yuklab bo'lmadi")}</p>
          <Button variant="ghost" size="md" type="button" className="mt-3.5" onClick={() => void bootstrap()}>
            {tr('Повторить', 'Qayta urinish')}
          </Button>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <header className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Способы оплаты', "To'lov usullari")}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">
            {tr(
              'Sellgram не принимает деньги за магазин. Владелец сам подключает и настраивает свои реквизиты.',
              "Sellgram do'kon pullarini qabul qilmaydi. Egasi o'z rekvizitlari va provayderlarini o'zi sozlaydi."
            )}
          </p>
        </div>
        <Button variant="primary" size="md" type="button" onClick={openCreate}>
          + {tr('Добавить', "Qo'shish")}
        </Button>
      </header>

      <Card>
        <Select label={tr('Магазин', "Do'kon")} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>{store.name}</option>
          ))}
        </Select>
      </Card>

      <Table
        columns={columns}
        data={methods}
        rowKey={(method) => method.id}
        emptyMessage={
          <div className="py-4">
            <div className="text-neutral-500 mb-3">{tr('Способы оплаты не настроены', "To'lov usullari sozlanmagan")}</div>
            <Button variant="primary" size="md" type="button" onClick={openCreate}>
              + {tr('Добавить способ оплаты', "To'lov usulini qo'shish")}
            </Button>
          </div>
        }
      />

      <PaymentMethodFormModal
        open={formOpen}
        editing={!!editing}
        lang={lang}
        tr={tr}
        form={form}
        canSave={!!canSave}
        saving={saving}
        onProviderChange={applyProviderDefaults}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onSave={saveMethod}
        onClose={() => setFormOpen(false)}
      />
    </section>
  );
}
