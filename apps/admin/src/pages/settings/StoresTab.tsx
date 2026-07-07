import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { TabProps } from './types';

export default function StoresTab({ onNotice }: TabProps) {
  const { tr } = useAdminI18n();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [pendingDeleteStore, setPendingDeleteStore] = useState<string | null>(null);

  const [showStoreForm, setShowStoreForm] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [storeForm, setStoreForm] = useState({ name: '', botToken: '', welcomeMessage: '' });

  async function load() {
    setLoading(true);
    try {
      const storeList = await adminApi.getStores();
      setStores(Array.isArray(storeList) ? storeList : []);
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка при загрузке настроек', 'Sozlamalarni yuklashda xato'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreateStore() {
    setEditingStoreId(null);
    setStoreForm({ name: '', botToken: '', welcomeMessage: '' });
    setShowStoreForm(true);
  }

  function openEditStore(store: any) {
    setEditingStoreId(store.id);
    setStoreForm({ name: store.name || '', botToken: '', welcomeMessage: store.welcomeMessage || '' });
    setShowStoreForm(true);
  }

  async function saveStore() {
    if (saving) return;
    if (!editingStoreId && (!storeForm.name || !storeForm.botToken)) {
      onNotice('error', tr('Нужны название магазина и bot token', "Do'kon nomi va bot token kerak"));
      return;
    }
    setSaving(true);
    try {
      if (editingStoreId) {
        const payload: any = {
          name: storeForm.name,
          welcomeMessage: storeForm.welcomeMessage,
        };
        if (storeForm.botToken) payload.botToken = storeForm.botToken;
        await adminApi.updateStore(editingStoreId, payload);
      } else {
        await adminApi.createStore(storeForm);
      }
      setShowStoreForm(false);
      await load();
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteStore(id: string) {
    setPendingDeleteStore(null);
    try {
      await adminApi.deleteStore(id);
      await load();
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function checkStoreConnection(store: any) {
    try {
      const data = await adminApi.checkStoreBot(store.id);
      const ok = Boolean(data?.ok);
      const webhook = data?.webhook;
      const mismatch = webhook?.matchesExpected === false;

      const parts = [
        ok
          ? tr(`Бот "${store.name}" подключён корректно.`, `"${store.name}" boti to'g'ri ulangan.`)
          : tr(`Бот "${store.name}" проверен, найдены проблемы.`, `"${store.name}" botida muammo topildi.`),
      ];

      if (data?.bot?.username) parts.push(`@${data.bot.username}`);
      if (mismatch && webhook?.expectedUrl) {
        parts.push(tr('Webhook отличается от ожидаемого.', 'Webhook kutilgan manzilga mos emas.'));
      }
      if (typeof webhook?.pendingUpdateCount === 'number') {
        parts.push(tr(`Pending updates: ${webhook.pendingUpdateCount}`, `Kutilayotgan update: ${webhook.pendingUpdateCount}`));
      }
      if (data?.error) parts.push(String(data.error));

      onNotice(ok ? 'success' : 'error', parts.join(' | '));
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  async function activateStoreConnection(store: any) {
    if (activating) return;
    setActivating(store.id);
    try {
      const data = await adminApi.activateStore(store.id);
      const webhookUrl = data?.webhookUrl ? `\nWebhook: ${data.webhookUrl}` : '';
      onNotice('success', tr(`Бот "${store.name}" подключён успешно.${webhookUrl}`, `"${store.name}" boti muvaffaqiyatli ulandi.${webhookUrl}`));
      await load();
    } catch (err: any) {
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setActivating(null);
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
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="sg-skeleton" style={{ height: 32, width: 90, borderRadius: 8 }} />
                <div className="sg-skeleton" style={{ height: 32, width: 90, borderRadius: 8 }} />
                <div className="sg-skeleton" style={{ height: 32, width: 80, borderRadius: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="sg-grid" style={{ gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p className="sg-subtitle" style={{ margin: 0 }}>
            {tr('Один магазин = один Telegram-бот', "Bitta do'kon = bitta Telegram bot")}
          </p>
          <button className="sg-btn primary" type="button" onClick={openCreateStore}>
            + {tr('Магазин', "Do'kon")}
          </button>
        </div>

        {stores.map((store) => {
          const isConfirming = pendingDeleteStore === store.id;
          return (
            <article key={store.id} className="sg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 800 }}>{store.name}</p>
                {store.botUsername && <p style={{ margin: '4px 0 0', color: '#2e7d64', fontSize: 13 }}>@{store.botUsername}</p>}
              </div>
              {isConfirming ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                    {tr('Удалить магазин?', "Do'konni o'chirish?")}
                  </span>
                  <button className="sg-btn danger" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => void deleteStore(store.id)}>
                    {tr('Да', 'Ha')}
                  </button>
                  <button className="sg-btn ghost" type="button" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setPendingDeleteStore(null)}>
                    {tr('Отмена', 'Bekor')}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="sg-btn ghost" type="button" onClick={() => openEditStore(store)}>
                    {tr('Редактировать', 'Tahrirlash')}
                  </button>
                  <button className="sg-btn ghost" type="button" onClick={() => checkStoreConnection(store)}>
                    {tr('Проверить бота', 'Botni tekshirish')}
                  </button>
                  <button className="sg-btn primary" type="button" disabled={!!activating} onClick={() => void activateStoreConnection(store)}>
                    {activating === store.id ? '...' : tr('Подключить', 'Ulash')}
                  </button>
                  <button
                    className="sg-btn danger"
                    type="button"
                    disabled={stores.length <= 1}
                    title={stores.length <= 1 ? tr('Нельзя удалить последний магазин', "Oxirgi do'konni o'chirib bo'lmaydi") : undefined}
                    onClick={() => setPendingDeleteStore(store.id)}
                  >
                    {tr('Удалить', "O'chirish")}
                  </button>
                </div>
              )}
            </article>
          );
        })}

        {stores.length === 0 && <p className="sg-subtitle">{tr('Пока магазинов нет', "Hozircha do'konlar yo'q")}</p>}
      </section>

      {showStoreForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div className="sg-card" style={{ width: '100%', maxWidth: 520 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {editingStoreId ? tr('Редактировать магазин', "Do'konni tahrirlash") : tr('Новый магазин', "Yangi do'kon")}
            </h3>

            <div className="sg-grid" style={{ gap: 10, marginTop: 12 }}>
              <input
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('Название магазина', "Do'kon nomi")}
              />
              <input
                value={storeForm.botToken}
                onChange={(e) => setStoreForm({ ...storeForm, botToken: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder="Bot token"
              />
              <textarea
                value={storeForm.welcomeMessage}
                onChange={(e) => setStoreForm({ ...storeForm, welcomeMessage: e.target.value })}
                rows={3}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', resize: 'vertical' }}
                placeholder={tr('Приветственное сообщение', 'Xush kelibsiz xabari')}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void saveStore()}>
                  {saving ? '...' : tr('Сохранить', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" disabled={saving} onClick={() => setShowStoreForm(false)}>
                  {tr('Отмена', 'Bekor qilish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
