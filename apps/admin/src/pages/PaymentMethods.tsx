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
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  async function archiveMethod(methodId: string) {
    setPendingArchive(null);
    try {
      await adminApi.deleteStorePaymentMethod(storeId, methodId);
      await loadMethods(storeId);
      showNotice('success', tr('\u0421\u043f\u043e\u0441\u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u044b \u0430\u0440\u0445\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u043d', "To'lov usuli arxivlandi"));
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
    }
  }

  const noticeNode = notice ? (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 200, minWidth: 260, maxWidth: 420,
      borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 700,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', animation: 'sg-fade-in 0.2s ease both',
      color: notice.tone === 'error' ? '#991b1b' : '#065f46',
      background: notice.tone === 'error' ? '#fee2e2' : '#d1fae5',
      border: `1px solid ${notice.tone === 'error' ? '#fecaca' : '#a7f3d0'}`,
    }}>
      {notice.message}
    </div>
  ) : null;

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div className="sg-skeleton" style={{ height: 36, width: '30%' }} />
        <div className="sg-skeleton" style={{ height: 20, width: '55%' }} />
        <div className="sg-skeleton" style={{ height: 120 }} />
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <header>
          <h2 className="sg-title">{tr('Способы оплаты', "To'lov usullari")}</h2>
        </header>
        <div className="sg-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#be123c' }}>{tr('Не удалось загрузить данные', "Ma'lumotlarni yuklab bo'lmadi")}</p>
          <button className="sg-btn ghost" style={{ marginTop: 14 }} onClick={() => void bootstrap()}>{tr('Повторить', 'Qayta urinish')}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}
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
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="sg-badge" style={method.isActive
                      ? { background: '#d1fae5', color: '#065f46' }
                      : { background: '#f3f4f6', color: '#4b5563' }}>
                      {method.isActive ? tr('\u0410\u043a\u0442\u0438\u0432\u0435\u043d', 'Faol') : tr('\u041e\u0442\u043a\u043b\u044e\u0447\u0435\u043d', "O'chirilgan")}
                    </span>
                    {method.isDefault && (
                      <span className="sg-badge" style={{ background: '#ede9fe', color: '#5b21b6' }}>
                        {tr('\u041f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e', 'Asosiy')}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  {pendingArchive === method.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#4b5563' }}>{tr('\u0423\u0434\u0430\u043b\u0438\u0442\u044c?', "O'chirish?")}</span>
                      <button className="sg-btn danger" type="button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => archiveMethod(method.id)}>
                        {tr('\u0414\u0430', 'Ha')}
                      </button>
                      <button className="sg-btn ghost" type="button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setPendingArchive(null)}>
                        {tr('\u041d\u0435\u0442', "Yo'q")}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="sg-btn ghost" type="button" onClick={() => openEdit(method)}>
                        {tr('\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c', 'Tahrirlash')}
                      </button>
                      <button className="sg-btn danger" type="button" onClick={() => setPendingArchive(method.id)}>
                        {tr('\u0410\u0440\u0445\u0438\u0432', 'Arxiv')}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {methods.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <div style={{ color: '#6b7a71', marginBottom: 12 }}>
                    {tr('Способы оплаты не настроены', "To'lov usullari sozlanmagan")}
                  </div>
                  <button className="sg-btn primary" type="button" onClick={openCreate}>
                    + {tr('Добавить способ оплаты', "To'lov usulini qo'shish")}
                  </button>
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
