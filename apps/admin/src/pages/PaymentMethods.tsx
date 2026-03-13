import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';
import PaymentMethodFormModal from '../components/payments/payment-method-form-modal';
import {
  buildPaymentMethodPayload,
  emptyPaymentMethodForm,
  formFromMethod,
  FormState,
  PROVIDER_DEFAULTS,
  ProviderCode,
} from '../components/payments/payment-method-model';

export default function PaymentMethods() {
  const { tr, lang } = useAdminI18n();
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [methods, setMethods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyPaymentMethodForm(0));

  async function loadStores() {
    const list = await adminApi.getStores();
    const normalized = Array.isArray(list) ? list : [];
    setStores(normalized);
    if (!storeId && normalized[0]?.id) setStoreId(normalized[0].id);
  }

  async function loadMethods(targetStoreId: string) {
    if (!targetStoreId) return;
    const list = await adminApi.getStorePaymentMethods(targetStoreId);
    setMethods(Array.isArray(list) ? list : []);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      await loadStores();
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

  async function save() {
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
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function archiveMethod(methodId: string) {
    if (!confirm(tr('Архивировать этот способ оплаты?', "Ushbu to'lov usulini arxivlaysizmi?"))) return;
    try {
      await adminApi.deleteStorePaymentMethod(storeId, methodId);
      await loadMethods(storeId);
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) return <p className="text-gray-400">{tr('Загрузка способов оплаты...', "To'lov usullari yuklanmoqda...")}</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 className="text-2xl font-bold">{tr('Способы оплаты магазина', "Do'kon to'lov usullari")}</h2>
          <p className="text-sm text-gray-500">
            {tr('Платформа не принимает деньги магазина. Владелец сам настраивает свои реквизиты и провайдеров.', "Platforma do'kon puli bilan ishlamaydi. Egasi rekvizit va provayderlarini o'zi sozlaydi.")}
          </p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
          + {tr('Добавить', "Qo'shish")}
        </Button>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="text-sm text-gray-500">{tr('Магазин', "Do'kon")}</label>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left">
              <th className="px-4 py-3">{tr('Название', 'Nomi')}</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">{tr('Флаги', 'Holat')}</th>
              <th className="px-4 py-3">{tr('Действия', 'Amallar')}</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((method) => (
              <tr key={method.id} className="border-t">
                <td className="px-4 py-3">
                  <p className="font-medium">{method.title}</p>
                  {method.description && <p className="text-xs text-gray-500">{method.description}</p>}
                </td>
                <td className="px-4 py-3">{method.provider}</td>
                <td className="px-4 py-3">{method.code}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-1 rounded bg-gray-100 mr-1">{method.isActive ? tr('активен', 'faol') : tr('выкл', "o'chirilgan")}</span>
                  {method.isDefault && <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">{tr('по умолчанию', 'asosiy')}</span>}
                </td>
                <td className="px-4 py-3">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button onClick={() => openEdit(method)} className="px-2 py-1 rounded bg-blue-50 text-blue-700">{tr('Изменить', 'Tahrirlash')}</Button>
                    <Button onClick={() => archiveMethod(method.id)} className="px-2 py-1 rounded bg-red-50 text-red-700">{tr('Архив', 'Arxiv')}</Button>
                  </div>
                </td>
              </tr>
            ))}
            {methods.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">{tr('Способы оплаты не настроены.', "To'lov usullari sozlanmagan.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
        onSave={save}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
