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

  if (loading) return <p className="sg-subtitle">{tr('Загрузка способов оплаты...', "To'lov usullari yuklanmoqda...")}</p>;

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 className="sg-title">{tr('Способы оплаты', "To'lov usullari")}</h2>
          <p className="sg-subtitle">
            {tr(
              'Sellgram не принимает деньги за магазин. Владелец сам подключает и настраивает свои реквизиты.',
              "Sellgram do'kon pullarini qabul qilmaydi. Egasi o'z rekvizitlari va provayderlarini o'zi sozlaydi."
            )}
          </p>
        </div>
        <button onClick={openCreate} className="sg-btn primary" type="button">
          + {tr('Добавить', "Qo'shish")}
        </button>
      </header>

      <div className="sg-card">
        <label style={{ display: 'block', color: '#5f6d64', fontSize: 13, marginBottom: 6 }}>{tr('Магазин', "Do'kon")}</label>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="w-full"
          style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="sg-table">
          <thead>
            <tr>
              <th>{tr('Название', 'Nomi')}</th>
              <th>Provider</th>
              <th>Code</th>
              <th>{tr('Флаги', 'Holat')}</th>
              <th>{tr('Действия', 'Amallar')}</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((method) => (
              <tr key={method.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{method.title}</div>
                  {method.description && <div style={{ color: '#617068', fontSize: 12 }}>{method.description}</div>}
                </td>
                <td>{method.provider}</td>
                <td>{method.code}</td>
                <td>
                  <span className="sg-badge" style={{ background: '#eef3f0', color: '#476154', marginRight: 6 }}>
                    {method.isActive ? tr('Активен', 'Faol') : tr('Отключен', "O'chirilgan")}
                  </span>
                  {method.isDefault && (
                    <span className="sg-badge" style={{ background: '#e8f7ef', color: '#0b7f57' }}>
                      {tr('По умолчанию', 'Asosiy')}
                    </span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="sg-btn ghost" type="button" onClick={() => openEdit(method)}>
                      {tr('Изменить', 'Tahrirlash')}
                    </button>
                    <button className="sg-btn danger" type="button" onClick={() => archiveMethod(method.id)}>
                      {tr('Архив', 'Arxiv')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {methods.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: '#6b7a71' }}>
                  {tr('Способы оплаты не настроены', "To'lov usullari sozlanmagan")}
                </td>
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
        onSave={saveMethod}
        onClose={() => setFormOpen(false)}
      />
    </section>
  );
}
