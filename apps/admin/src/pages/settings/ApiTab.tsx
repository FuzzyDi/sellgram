import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { TabProps } from './types';

export default function ApiTab({ onNotice }: TabProps) {
  const { tr, locale } = useAdminI18n();
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyForm, setApiKeyForm] = useState({ name: '', expiresAt: '' });
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const keyList = await adminApi.getApiKeys().catch(() => []);
      setApiKeys(Array.isArray(keyList) ? keyList : []);
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка при загрузке настроек', 'Sozlamalarni yuklashda xato'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createApiKey() {
    if (!apiKeyForm.name.trim() || saving) return;
    setSaving(true);
    try {
      const payload: any = { name: apiKeyForm.name.trim() };
      if (apiKeyForm.expiresAt) payload.expiresAt = new Date(apiKeyForm.expiresAt).toISOString();
      const data = await adminApi.createApiKey(payload);
      setNewKeySecret(data.key);
      setApiKeyForm({ name: '', expiresAt: '' });
      await load();
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function revokeApiKey(id: string) {
    setPendingDeleteKey(null);
    try {
      await adminApi.revokeApiKey(id);
      await load();
      onNotice('success', tr('Ключ отозван', 'Kalit bekor qilindi'));
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #edf2ee' }}>
              <div style={{ flex: 1 }}>
                <div className="sg-skeleton" style={{ height: 16, width: '40%' }} />
                <div className="sg-skeleton" style={{ height: 12, width: '25%', marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="sg-grid" style={{ gap: 10 }}>
      <article className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Public API — ключи доступа', 'Public API — kirish kalitlari')}</h3>
        <p className="sg-subtitle">{tr('Создайте API-ключ для интеграций. Ключ показывается только один раз.', "Integratsiyalar uchun API kalit yarating. Kalit faqat bir marta ko'rsatiladi.")}</p>

        {newKeySecret && (
          <div className="sg-card" style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #86efac' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#065f46' }}>{tr('Ваш новый ключ (сохраните сейчас):', 'Yangi kalitingiz (hozir saqlang):')}</p>
            <p style={{ margin: '8px 0 0', fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all', color: '#1a2e1e' }}>{newKeySecret}</p>
            <button className="sg-btn ghost" type="button" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setNewKeySecret(null)}>
              {tr('Закрыть', 'Yopish')}
            </button>
          </div>
        )}

        <div className="sg-card soft" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input
              value={apiKeyForm.name}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, name: e.target.value })}
              placeholder={tr('Название ключа', 'Kalit nomi')}
              style={{ flex: 1, minWidth: 180, border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
            />
            <input
              type="date"
              value={apiKeyForm.expiresAt}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, expiresAt: e.target.value })}
              title={tr('Срок действия (необязательно)', 'Amal qilish muddati (ixtiyoriy)')}
              style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', width: 160 }}
            />
            <button
              className="sg-btn primary"
              type="button"
              disabled={saving || !apiKeyForm.name.trim()}
              onClick={() => void createApiKey()}
            >
              {saving ? '...' : tr('Создать ключ', 'Kalit yaratish')}
            </button>
          </div>
        </div>

        <div className="sg-grid" style={{ gap: 8, marginTop: 10 }}>
          {apiKeys.map((key) => (
            <div key={key.id} className="sg-card soft" style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{key.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7a71', marginTop: 2 }}>
                    <span style={{ fontFamily: 'monospace' }}>{key.prefix}...</span>
                    {' · '}
                    {key.isActive ? tr('активен', 'faol') : tr('отозван', 'bekor qilingan')}
                    {key.expiresAt && ` · ${tr('до', 'muddati')} ${new Date(key.expiresAt).toLocaleDateString(locale)}`}
                    {key.lastUsedAt && ` · ${tr('посл. исп.', 'oxirgi foy.')} ${new Date(key.lastUsedAt).toLocaleDateString(locale)}`}
                  </div>
                </div>
                {pendingDeleteKey === key.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>{tr('Отозвать ключ?', 'Kalitni bekor qilish?')}</span>
                    <button className="sg-btn danger" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => void revokeApiKey(key.id)}>{tr('Да', 'Ha')}</button>
                    <button className="sg-btn ghost" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setPendingDeleteKey(null)}>{tr('Отмена', 'Bekor')}</button>
                  </div>
                ) : (
                  <button className="sg-btn danger" type="button" style={{ padding: '5px 14px', fontSize: 13 }} onClick={() => setPendingDeleteKey(key.id)}>
                    {tr('Отозвать', 'Bekor qilish')}
                  </button>
                )}
              </div>
            </div>
          ))}
          {apiKeys.length === 0 && <p className="sg-subtitle">{tr('Нет API-ключей', "API kalitlar yo'q")}</p>}
        </div>

        <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{tr('Использование', 'Foydalanish')}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
            GET https://api.sellgram.uz/api/v1/products<br />
            Authorization: Bearer {'<'}your_key{'>'}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
            {tr('Эндпоинты: GET /v1/products, GET /v1/products/:id, GET /v1/orders, GET /v1/orders/:id, PATCH /v1/orders/:id/status', 'Endpointlar: GET /v1/products, GET /v1/products/:id, GET /v1/orders, GET /v1/orders/:id, PATCH /v1/orders/:id/status')}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
            {tr(
              'Лимит: 60 запросов / минуту на ключ. Ключ можно отозвать в любой момент — он перестанет работать немедленно.',
              "Limit: daqiqada 60 so'rov / kalit. Kalitni istalgan vaqtda bekor qilish mumkin — u darhol ishlamay qoladi."
            )}
          </p>
        </div>
      </article>
    </section>
  );
}
