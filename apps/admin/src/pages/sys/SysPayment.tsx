import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

type MethodType = 'bank' | 'card' | 'payme' | 'click';

const METHODS: { type: MethodType; label: string; icon: string; fields: { key: string; label: string; placeholder?: string }[] }[] = [
  {
    type: 'bank',
    label: 'Банковский перевод',
    icon: '🏦',
    fields: [
      { key: 'recipient',  label: 'Получатель',     placeholder: 'ООО "Компания"' },
      { key: 'bank',       label: 'Банк',            placeholder: 'АКБ "Капиталбанк"' },
      { key: 'account',    label: 'Расчётный счёт',  placeholder: '20208000000000000000' },
      { key: 'inn',        label: 'ИНН / ПИНФЛ',     placeholder: '123456789' },
      { key: 'mfo',        label: 'МФО',             placeholder: '00882' },
      { key: 'note',       label: 'Примечание',      placeholder: 'В назначении: оплата тарифа' },
    ],
  },
  {
    type: 'card',
    label: 'Банковская карта',
    icon: '💳',
    fields: [
      { key: 'number', label: 'Номер карты',  placeholder: '8600 0000 0000 0000' },
      { key: 'holder', label: 'Владелец',     placeholder: 'RASHID KARIMOV' },
      { key: 'bank',   label: 'Банк карты',   placeholder: 'Uzcard / Humo' },
      { key: 'note',   label: 'Примечание',   placeholder: 'Сообщите об оплате в поддержку' },
    ],
  },
  {
    type: 'payme',
    label: 'Payme',
    icon: '🔵',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', placeholder: '5e730e8e0b852a417aa49ceb' },
      { key: 'note',       label: 'Примечание',  placeholder: 'Оплата через Payme' },
    ],
  },
  {
    type: 'click',
    label: 'Click',
    icon: '🟢',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', placeholder: '12345' },
      { key: 'serviceId',  label: 'Service ID',  placeholder: '67890' },
      { key: 'note',       label: 'Примечание',  placeholder: 'Оплата через Click' },
    ],
  },
];

function methodKey(type: MethodType, field: string) {
  return `${type}_${field}`;
}

export default function SysPayment() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [softMode, setSoftMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [softSaving, setSoftSaving] = useState(false);
  const [notice, setNotice] = useState('');

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  useEffect(() => {
    Promise.allSettled([
      systemApi.billingSettings().then(setSettings),
      systemApi.softMode().then((r: any) => setSoftMode(r?.enabled ?? false)),
    ]).finally(() => setLoading(false));
  }, []);

  function setField(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  function toggleMethod(type: MethodType, enabled: boolean) {
    setSettings(prev => ({ ...prev, [`${type}_enabled`]: enabled ? 'true' : 'false' }));
  }

  function isEnabled(type: MethodType) {
    const v = settings[`${type}_enabled`];
    // bank enabled by default if not set
    if (v === undefined) return type === 'bank';
    return v === 'true';
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await systemApi.updateBillingSettings(settings);
      showNotice('✅ Настройки оплаты сохранены');
    } catch (e: any) {
      showNotice('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSoftMode(val: boolean) {
    setSoftSaving(true);
    try {
      await systemApi.updateSoftMode(val);
      setSoftMode(val);
      showNotice(val ? '⚠ Мягкий режим ВКЛЮЧЁН' : '✅ Авто-даунгрейд восстановлен');
    } catch (e: any) {
      showNotice('❌ ' + e.message);
    } finally {
      setSoftSaving(false);
    }
  }

  const enabledCount = METHODS.filter(m => isEnabled(m.type)).length;

  return (
    <div style={{ padding: 28, maxWidth: 860 }}>
      {notice && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: notice.startsWith('✅') ? '#d1fae5' : notice.startsWith('⚠') ? '#fef3c7' : '#fee2e2', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, color: notice.startsWith('✅') ? '#065f46' : notice.startsWith('⚠') ? '#92400e' : '#991b1b', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>{notice}</div>
      )}

      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Настройки оплаты</h1>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b' }}>
        Тенантам показываются только включённые способы. Активно: {enabledCount} из {METHODS.length}.
      </p>

      {loading && <div style={{ color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>}

      {!loading && (
        <>
          {/* Soft mode */}
          <div style={{ background: softMode ? '#fffbeb' : '#fff', border: softMode ? '2px solid #f59e0b' : '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>⚠ Мягкий режим биллинга</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Если включён — истёкшие подписки не даунгрейдятся автоматически</div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              <input type="checkbox" checked={softMode} onChange={e => void toggleSoftMode(e.target.checked)} disabled={softSaving}
                style={{ width: 18, height: 18, accentColor: '#f59e0b' }} />
              <span style={{ color: softMode ? '#d97706' : '#374151' }}>{softMode ? 'ВКЛЮЧЁН' : 'Выкл'}</span>
              {softSaving && <span style={{ fontSize: 12, color: '#94a3b8' }}>...</span>}
            </label>
          </div>

          {/* Email */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Email для подтверждений</label>
            <input value={settings['email'] ?? ''} onChange={e => setField('email', e.target.value)}
              placeholder="billing@example.com"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
          </div>

          {/* Payment methods */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {METHODS.map(({ type, label, icon, fields }) => {
              const enabled = isEnabled(type);
              return (
                <div key={type} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: enabled ? '2px solid #3b82f6' : '1px solid #e5e7eb', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: enabled ? '#eff6ff' : '#f8fafc', cursor: 'pointer' }}
                    onClick={() => toggleMethod(type, !enabled)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{label}</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={enabled} onChange={e => toggleMethod(type, e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#3b82f6' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: enabled ? '#2563eb' : '#9ca3af' }}>{enabled ? 'Включён' : 'Выкл'}</span>
                    </label>
                  </div>

                  {/* Fields */}
                  {enabled && (
                    <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {fields.map(({ key, label: flabel, placeholder }) => (
                        <div key={key} style={{ gridColumn: key === 'note' || key === 'merchantId' ? '1 / -1' : undefined }}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{flabel}</label>
                          <input
                            value={settings[methodKey(type, key)] ?? ''}
                            onChange={e => setField(methodKey(type, key), e.target.value)}
                            placeholder={placeholder}
                            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={saveSettings} disabled={saving}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </>
      )}
    </div>
  );
}
