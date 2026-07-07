import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
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
      <div className="border border-neutral-200 rounded-token-lg overflow-hidden divide-y divide-neutral-200">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-3.5">
            <div className="flex-1">
              <div className="h-4 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-3 w-1/4 rounded-token-sm bg-neutral-100 animate-pulse mt-1.5" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-24 rounded-token-md bg-neutral-100 animate-pulse" />
              <div className="h-8 w-24 rounded-token-md bg-neutral-100 animate-pulse" />
              <div className="h-8 w-20 rounded-token-md bg-neutral-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-token-sm text-neutral-500">
            {tr('Один магазин = один Telegram-бот', "Bitta do'kon = bitta Telegram bot")}
          </p>
          <Button variant="primary" size="md" type="button" onClick={openCreateStore}>
            + {tr('Магазин', "Do'kon")}
          </Button>
        </div>

        {stores.map((store) => {
          const isConfirming = pendingDeleteStore === store.id;
          return (
            <Card key={store.id} className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="m-0 font-semibold text-neutral-800">{store.name}</p>
                {store.botUsername && <p className="mt-1 mb-0 text-token-sm text-success">@{store.botUsername}</p>}
              </div>
              {isConfirming ? (
                <div className="flex gap-2 items-center">
                  <span className="text-token-xs font-medium text-warning">
                    {tr('Удалить магазин?', "Do'konni o'chirish?")}
                  </span>
                  <Button variant="danger" size="sm" type="button" onClick={() => void deleteStore(store.id)}>
                    {tr('Да', 'Ha')}
                  </Button>
                  <Button variant="ghost" size="sm" type="button" onClick={() => setPendingDeleteStore(null)}>
                    {tr('Отмена', 'Bekor')}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <Button variant="ghost" size="md" type="button" onClick={() => openEditStore(store)}>
                    {tr('Редактировать', 'Tahrirlash')}
                  </Button>
                  <Button variant="ghost" size="md" type="button" onClick={() => checkStoreConnection(store)}>
                    {tr('Проверить бота', 'Botni tekshirish')}
                  </Button>
                  <Button variant="primary" size="md" type="button" disabled={!!activating} onClick={() => void activateStoreConnection(store)}>
                    {activating === store.id ? '...' : tr('Подключить', 'Ulash')}
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    type="button"
                    disabled={stores.length <= 1}
                    title={stores.length <= 1 ? tr('Нельзя удалить последний магазин', "Oxirgi do'konni o'chirib bo'lmaydi") : undefined}
                    onClick={() => setPendingDeleteStore(store.id)}
                  >
                    {tr('Удалить', "O'chirish")}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}

        {stores.length === 0 && <p className="text-token-sm text-neutral-500">{tr('Пока магазинов нет', "Hozircha do'konlar yo'q")}</p>}
      </section>

      {showStoreForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-[520px]">
            <h3 className="m-0 text-token-xl font-semibold text-neutral-800">
              {editingStoreId ? tr('Редактировать магазин', "Do'konni tahrirlash") : tr('Новый магазин', "Yangi do'kon")}
            </h3>

            <div className="flex flex-col gap-3 mt-3">
              <Input
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                placeholder={tr('Название магазина', "Do'kon nomi")}
              />
              <Input
                value={storeForm.botToken}
                onChange={(e) => setStoreForm({ ...storeForm, botToken: e.target.value })}
                placeholder="Bot token"
              />
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={storeForm.welcomeMessage}
                  onChange={(e) => setStoreForm({ ...storeForm, welcomeMessage: e.target.value })}
                  rows={3}
                  className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 resize-y"
                  placeholder={tr('Приветственное сообщение', 'Xush kelibsiz xabari')}
                />
              </div>
              <div className="flex gap-2.5">
                <Button variant="primary" size="md" type="button" disabled={saving} onClick={() => void saveStore()}>
                  {saving ? '...' : tr('Сохранить', 'Saqlash')}
                </Button>
                <Button variant="ghost" size="md" type="button" disabled={saving} onClick={() => setShowStoreForm(false)}>
                  {tr('Отмена', 'Bekor qilish')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
