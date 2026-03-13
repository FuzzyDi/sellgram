import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

export default function Settings() {
  const { tr, locale } = useAdminI18n();
  const [tab, setTab] = useState<'stores' | 'zones' | 'loyalty'>('stores');
  const [stores, setStores] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [telegramLinkData, setTelegramLinkData] = useState<any | null>(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);

  const [showStoreForm, setShowStoreForm] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [storeForm, setStoreForm] = useState({ name: '', botToken: '', welcomeMessage: '' });

  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: '', price: '', freeFrom: '', storeId: '' });

  async function load() {
    setLoading(true);
    try {
      const [s, z, l] = await Promise.all([
        adminApi.getStores(),
        adminApi.getDeliveryZones(),
        adminApi.getLoyaltyConfig(),
      ]);
      setStores(Array.isArray(s) ? s : []);
      setZones(Array.isArray(z) ? z : []);
      setLoyalty(l);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generateTelegramLinkCode() {
    setTelegramLinkLoading(true);
    try {
      const data = await adminApi.createTelegramLinkCode();
      setTelegramLinkData(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTelegramLinkLoading(false);
    }
  }

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
    try {
      if (editingStoreId) {
        const data: any = { name: storeForm.name, welcomeMessage: storeForm.welcomeMessage };
        if (storeForm.botToken) data.botToken = storeForm.botToken;
        await adminApi.updateStore(editingStoreId, data);
      } else {
        if (!storeForm.name || !storeForm.botToken) {
          alert(tr('Нужны название магазина и bot token', 'Do\'kon nomi va bot token kerak'));
          return;
        }
        await adminApi.createStore(storeForm);
      }
      setShowStoreForm(false);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  function openCreateZone() {
    setEditingZoneId(null);
    setZoneForm({ name: '', price: '', freeFrom: '', storeId: stores[0]?.id || '' });
    setShowZoneForm(true);
  }

  function openEditZone(zone: any) {
    setEditingZoneId(zone.id);
    setZoneForm({
      name: zone.name || '',
      price: String(zone.price || ''),
      freeFrom: zone.freeFrom ? String(zone.freeFrom) : '',
      storeId: zone.storeId || '',
    });
    setShowZoneForm(true);
  }

  async function saveZone() {
    try {
      const data: any = {
        name: zoneForm.name,
        price: Number(zoneForm.price),
        freeFrom: zoneForm.freeFrom ? Number(zoneForm.freeFrom) : null,
      };
      if (editingZoneId) {
        await adminApi.updateDeliveryZone(editingZoneId, data);
      } else {
        await adminApi.createDeliveryZone({ ...data, storeId: zoneForm.storeId || stores[0]?.id });
      }
      setShowZoneForm(false);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function deleteZone(id: string) {
    if (!confirm(tr('Удалить эту зону?', 'Bu hudud o\'chirilsinmi?'))) return;
    try {
      await adminApi.deleteDeliveryZone(id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function saveLoyalty() {
    try {
      await adminApi.updateLoyaltyConfig(loyalty);
      alert(tr('Сохранено', 'Saqlandi'));
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) return <p className="text-gray-400">{tr('Загрузка настроек...', 'Sozlamalar yuklanmoqda...')}</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">{tr('Настройки', 'Sozlamalar')}</h2>

      <div className="bg-white rounded-xl border p-4 mb-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p className="font-semibold">{tr('Привязка Telegram-админа', 'Telegram adminini bog\'lash')}</p>
            <p className="text-sm text-gray-500">{tr('Сгенерируйте код и отправьте в бота: /admin CODE', 'Kod yarating va botga yuboring: /admin CODE')}</p>
          </div>
          <Button onClick={generateTelegramLinkCode} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">
            {telegramLinkLoading ? tr('Генерация...', 'Yaratilmoqda...') : tr('Сгенерировать код', 'Kod yaratish')}
          </Button>
        </div>

        {telegramLinkData && (
          <div className="mt-3 p-3 rounded-lg bg-slate-50 border">
            <p className="text-sm">{tr('Код', 'Kod')}: <span className="font-mono font-bold">{telegramLinkData.code}</span></p>
            <p className="text-xs text-gray-500 mt-1">{tr('Истекает', 'Amal qilish muddati')}: {new Date(telegramLinkData.expiresAt).toLocaleString(locale)}</p>
            <p className="text-xs text-gray-500 mt-1">{tr('Команда', 'Buyruq')}: <span className="font-mono">{telegramLinkData.command}</span></p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f3f4f6', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'stores', label: tr('Магазины', 'Do\'konlar') },
          { key: 'zones', label: tr('Доставка', 'Yetkazib berish') },
          { key: 'loyalty', label: tr('Лояльность', 'Loyallik') },
        ].map((t: any) => (
          <Button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-md text-sm ${tab === t.key ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500'}`}>
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'stores' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <p className="text-sm text-gray-500">{tr('Один магазин = один Telegram-бот', 'Bitta do\'kon = bitta Telegram bot')}</p>
            <Button onClick={openCreateStore} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">+ {tr('Магазин', "Do'kon")}</Button>
          </div>

          {stores.map((store) => (
            <div key={store.id} className="bg-white rounded-xl border p-4 mb-3">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="font-bold">{store.name}</p>
                  {store.botUsername && <p className="text-sm text-blue-500">@{store.botUsername}</p>}
                </div>
                <Button onClick={() => openEditStore(store)} className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">{tr('Изменить', 'Tahrirlash')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'zones' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <p className="text-sm text-gray-500">{tr('Зоны и тарифы доставки', 'Yetkazib berish hududlari va tariflar')}</p>
            <Button onClick={openCreateZone} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">+ {tr('Зона', 'Hudud')}</Button>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-3">{tr('Зона', 'Hudud')}</th>
                  <th className="px-4 py-3">{tr('Цена', 'Narx')}</th>
                  <th className="px-4 py-3">{tr('Бесплатно от', 'Bepul chegarasi')}</th>
                  <th className="px-4 py-3">{tr('Действия', 'Amallar')}</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{zone.name}</td>
                    <td className="px-4 py-3">{Number(zone.price).toLocaleString()} UZS</td>
                    <td className="px-4 py-3 text-gray-500">{zone.freeFrom ? `${Number(zone.freeFrom).toLocaleString()} UZS` : '-'}</td>
                    <td className="px-4 py-3">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button onClick={() => openEditZone(zone)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded">{tr('Изменить', 'Tahrirlash')}</Button>
                        <Button onClick={() => deleteZone(zone.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded">{tr('Удалить', "O'chirish")}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'loyalty' && loyalty && (
        <div className="bg-white rounded-xl border p-6 max-w-lg">
          <h3 className="font-bold mb-4">{tr('Программа лояльности', 'Loyallik dasturi')}</h3>
          <form onSubmit={(e) => { e.preventDefault(); saveLoyalty(); }}>
            <div className="space-y-4">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="text-sm">
                <input type="checkbox" checked={!!loyalty.isEnabled} onChange={(e) => setLoyalty({ ...loyalty, isEnabled: e.target.checked })} /> {tr('Включена', 'Yoqilgan')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{tr('Сумма шага', 'Qadam summasi')}</label>
                  <input type="number" value={loyalty.unitAmount || 1000} onChange={(e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{tr('Баллов за шаг', 'Qadam uchun ball')}</label>
                  <input type="number" value={loyalty.pointsPerUnit || 1} onChange={(e) => setLoyalty({ ...loyalty, pointsPerUnit: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{tr('Цена 1 балла', '1 ball qiymati')}</label>
                  <input type="number" value={loyalty.pointValue || 100} onChange={(e) => setLoyalty({ ...loyalty, pointValue: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{tr('Макс. скидка %', 'Maks. chegirma %')}</label>
                  <input type="number" value={loyalty.maxDiscountPct || 30} onChange={(e) => setLoyalty({ ...loyalty, maxDiscountPct: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg">{tr('Сохранить', 'Saqlash')}</button>
            </div>
          </form>
        </div>
      )}

      {showStoreForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="font-bold mb-4">{editingStoreId ? tr('Редактировать магазин', 'Do\'konni tahrirlash') : tr('Новый магазин', 'Yangi do\'kon')}</h3>
            <input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2" placeholder={tr('Название магазина', 'Do\'kon nomi')} />
            <input value={storeForm.botToken} onChange={(e) => setStoreForm({ ...storeForm, botToken: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2" placeholder="Bot token" />
            <textarea value={storeForm.welcomeMessage} onChange={(e) => setStoreForm({ ...storeForm, welcomeMessage: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder={tr('Приветственное сообщение', 'Xush kelibsiz xabari')} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveStore} className="flex-1 bg-blue-600 text-white py-2 rounded-lg">{tr('Сохранить', 'Saqlash')}</button>
              <Button onClick={() => setShowStoreForm(false)} className="px-4 py-2 bg-gray-100 rounded-lg">{tr('Отмена', 'Bekor qilish')}</Button>
            </div>
          </div>
        </div>
      )}

      {showZoneForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="font-bold mb-4">{editingZoneId ? tr('Редактировать зону', 'Hududni tahrirlash') : tr('Новая зона', 'Yangi hudud')}</h3>
            {!editingZoneId && (
              <select value={zoneForm.storeId} onChange={(e) => setZoneForm({ ...zoneForm, storeId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2">
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            )}
            <input value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2" placeholder={tr('Название зоны', 'Hudud nomi')} />
            <input type="number" value={zoneForm.price} onChange={(e) => setZoneForm({ ...zoneForm, price: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mb-2" placeholder={tr('Цена', 'Narx')} />
            <input type="number" value={zoneForm.freeFrom} onChange={(e) => setZoneForm({ ...zoneForm, freeFrom: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={tr('Бесплатно от', 'Bepul chegarasi')} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveZone} className="flex-1 bg-blue-600 text-white py-2 rounded-lg">{tr('Сохранить', 'Saqlash')}</button>
              <Button onClick={() => setShowZoneForm(false)} className="px-4 py-2 bg-gray-100 rounded-lg">{tr('Отмена', 'Bekor qilish')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
