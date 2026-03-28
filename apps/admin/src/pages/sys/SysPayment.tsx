import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

const FIELDS = [
  { key: 'bank',       label: 'Банк' },
  { key: 'account',    label: 'Расчётный счёт' },
  { key: 'recipient',  label: 'Получатель' },
  { key: 'inn',        label: 'ИНН / ПИНФЛ' },
  { key: 'mfo',        label: 'МФО' },
  { key: 'note',       label: 'Примечание' },
  { key: 'email',      label: 'Email для подтверждений' },
];

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
      showNotice(val ? '⚠ Мягкий режим ВКЛЮЧЁН — авто-даунгрейд остановлен' : '✅ Авто-даунгрейд восстановлен');
    } catch (e: any) {
      showNotice('❌ ' + e.message);
    } finally {
      setSoftSaving(false);
    }
  }

  return (
    <div style={{ padding: 28, maxWidth: 800 }}>
      {notice && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: notice.startsWith('✅') ? '#d1fae5' : notice.startsWith('⚠') ? '#fef3c7' : '#fee2e2', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, color: notice.startsWith('✅') ? '#065f46' : notice.startsWith('⚠') ? '#92400e' : '#991b1b', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>{notice}</div>
      )}

      <h1 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Настройки оплаты</h1>

      {loading && <div style={{ color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>}

      {!loading && (
        <>
          {/* Soft mode */}
          <div style={{ background: softMode ? '#fffbeb' : '#fff', border: softMode ? '2px solid #f59e0b' : '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: '#0f172a' }}>
              ⚠ Мягкий режим биллинга
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
              Если включён — истёкшие подписки НЕ даунгрейдятся автоматически. Переключайте тенантов вручную.
            </p>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={softMode}
                onChange={e => void toggleSoftMode(e.target.checked)}
                disabled={softSaving}
                style={{ width: 18, height: 18, accentColor: '#f59e0b' }}
              />
              <span style={{ color: softMode ? '#d97706' : '#374151' }}>
                {softMode ? '⚠ Мягкий режим ВКЛЮЧЁН' : 'Авто-даунгрейд активен'}
              </span>
              {softSaving && <span style={{ fontSize: 12, color: '#94a3b8' }}>...</span>}
            </label>
          </div>

          {/* Bank details */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: '#0f172a' }}>🏦 Реквизиты для оплаты</div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
              Эти данные отображаются в инвойсах и счетах тенантов.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>
                  <input
                    value={settings[key] ?? ''}
                    onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={saveSettings}
              disabled={saving}
              style={{ marginTop: 20, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Сохранение...' : 'Сохранить реквизиты'}
            </button>
          </div>

          {/* Preview */}
          {Object.values(settings).some(v => v) && (
            <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: '#374151' }}>Предпросмотр реквизитов</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 2 }}>
                {settings.recipient && <div><strong>Получатель:</strong> {settings.recipient}</div>}
                {settings.bank && <div><strong>Банк:</strong> {settings.bank}</div>}
                {settings.account && <div><strong>Счёт:</strong> {settings.account}</div>}
                {settings.inn && <div><strong>ИНН / ПИНФЛ:</strong> {settings.inn}</div>}
                {settings.mfo && <div><strong>МФО:</strong> {settings.mfo}</div>}
                {settings.note && <div><strong>Примечание:</strong> {settings.note}</div>}
                {settings.email && <div><strong>Email:</strong> {settings.email}</div>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
