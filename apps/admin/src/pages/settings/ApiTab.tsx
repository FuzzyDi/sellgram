import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Badge from '../../components/Badge';
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
      <div className="border border-neutral-200 rounded-token-lg overflow-hidden divide-y divide-neutral-200">
        {[1, 2].map((i) => (
          <div key={i} className="p-3.5">
            <div className="h-4 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse" />
            <div className="h-3 w-1/4 rounded-token-sm bg-neutral-100 animate-pulse mt-1.5" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <Card>
        <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Public API — ключи доступа', 'Public API — kirish kalitlari')}</h3>
        <p className="text-token-sm text-neutral-500">{tr('Создайте API-ключ для интеграций. Ключ показывается только один раз.', "Integratsiyalar uchun API kalit yarating. Kalit faqat bir marta ko'rsatiladi.")}</p>

        {newKeySecret && (
          <Card className="mt-3 bg-success/5 border-success/30">
            <p className="m-0 font-semibold text-success">{tr('Ваш новый ключ (сохраните сейчас):', 'Yangi kalitingiz (hozir saqlang):')}</p>
            <p className="mt-2 mb-0 font-mono text-token-sm break-all text-neutral-800">{newKeySecret}</p>
            <Button variant="ghost" size="sm" type="button" className="mt-2" onClick={() => setNewKeySecret(null)}>
              {tr('Закрыть', 'Yopish')}
            </Button>
          </Card>
        )}

        <Card className="mt-3 bg-neutral-50">
          <div className="flex gap-2 flex-wrap items-end">
            <Input
              value={apiKeyForm.name}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, name: e.target.value })}
              placeholder={tr('Название ключа', 'Kalit nomi')}
              className="flex-1 min-w-[180px]"
            />
            <Input
              type="date"
              value={apiKeyForm.expiresAt}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, expiresAt: e.target.value })}
              title={tr('Срок действия (необязательно)', 'Amal qilish muddati (ixtiyoriy)')}
              className="w-40"
            />
            <Button
              variant="primary"
              size="md"
              type="button"
              disabled={saving || !apiKeyForm.name.trim()}
              onClick={() => void createApiKey()}
            >
              {saving ? '...' : tr('Создать ключ', 'Kalit yaratish')}
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-2 mt-3">
          {apiKeys.map((key) => (
            <Card key={key.id} className="bg-neutral-50 p-2.5">
              <div className="flex items-center justify-between gap-2.5 flex-wrap">
                <div>
                  <div className="font-semibold text-neutral-800">{key.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-token-xs text-neutral-500">
                    <span className="font-mono">{key.prefix}...</span>
                    <Badge variant={key.isActive ? 'success' : 'neutral'}>
                      {key.isActive ? tr('активен', 'faol') : tr('отозван', 'bekor qilingan')}
                    </Badge>
                    {key.expiresAt && <span>{tr('до', 'muddati')} {new Date(key.expiresAt).toLocaleDateString(locale)}</span>}
                    {key.lastUsedAt && <span>{tr('посл. исп.', 'oxirgi foy.')} {new Date(key.lastUsedAt).toLocaleDateString(locale)}</span>}
                  </div>
                </div>
                {pendingDeleteKey === key.id ? (
                  <div className="flex gap-2 items-center">
                    <span className="text-token-xs font-medium text-warning">{tr('Отозвать ключ?', 'Kalitni bekor qilish?')}</span>
                    <Button variant="danger" size="sm" type="button" onClick={() => void revokeApiKey(key.id)}>{tr('Да', 'Ha')}</Button>
                    <Button variant="ghost" size="sm" type="button" onClick={() => setPendingDeleteKey(null)}>{tr('Отмена', 'Bekor')}</Button>
                  </div>
                ) : (
                  <Button variant="danger" size="sm" type="button" onClick={() => setPendingDeleteKey(key.id)}>
                    {tr('Отозвать', 'Bekor qilish')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {apiKeys.length === 0 && <p className="text-token-sm text-neutral-500">{tr('Нет API-ключей', "API kalitlar yo'q")}</p>}
        </div>

        <Card className="mt-4 bg-neutral-50">
          <p className="m-0 font-semibold text-token-sm text-neutral-800">{tr('Использование', 'Foydalanish')}</p>
          <p className="mt-1.5 mb-0 text-token-xs text-neutral-500 font-mono">
            GET https://api.sellgram.uz/api/v1/products<br />
            Authorization: Bearer {'<'}your_key{'>'}
          </p>
          <p className="mt-2 mb-0 text-token-xs text-neutral-500">
            {tr('Эндпоинты: GET /v1/products, GET /v1/products/:id, GET /v1/orders, GET /v1/orders/:id, PATCH /v1/orders/:id/status', 'Endpointlar: GET /v1/products, GET /v1/products/:id, GET /v1/orders, GET /v1/orders/:id, PATCH /v1/orders/:id/status')}
          </p>
          <p className="mt-2 mb-0 text-token-xs text-neutral-500">
            {tr(
              'Лимит: 60 запросов / минуту на ключ. Ключ можно отозвать в любой момент — он перестанет работать немедленно.',
              "Limit: daqiqada 60 so'rov / kalit. Kalitni istalgan vaqtda bekor qilish mumkin — u darhol ishlamay qoladi."
            )}
          </p>
        </Card>
      </Card>
    </section>
  );
}
