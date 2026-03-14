import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type NoticeTone = 'success' | 'error' | 'info';

export default function Settings() {
  const { tr, locale } = useAdminI18n();
  const [tab, setTab] = useState<'stores' | 'zones' | 'loyalty'>('stores');
  const [stores, setStores] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

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
      const [storeList, zoneList, loyaltyConfig] = await Promise.all([
        adminApi.getStores(),
        adminApi.getDeliveryZones(),
        adminApi.getLoyaltyConfig(),
      ]);
      setStores(Array.isArray(storeList) ? storeList : []);
      setZones(Array.isArray(zoneList) ? zoneList : []);
      setLoyalty(loyaltyConfig);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }


  async function generateTelegramLinkCode() {
    setTelegramLinkLoading(true);
    try {
      const data = await adminApi.createTelegramLinkCode();
      setTelegramLinkData(data);
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
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
        const payload: any = {
          name: storeForm.name,
          welcomeMessage: storeForm.welcomeMessage,
        };
        if (storeForm.botToken) payload.botToken = storeForm.botToken;
        await adminApi.updateStore(editingStoreId, payload);
      } else {
        if (!storeForm.name || !storeForm.botToken) {
          showNotice('error', tr('Нужны название магазина и bot token', "Do'kon nomi va bot token kerak"));
          return;
        }
        await adminApi.createStore(storeForm);
      }
      setShowStoreForm(false);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
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
      const payload: any = {
        name: zoneForm.name,
        price: Number(zoneForm.price),
        freeFrom: zoneForm.freeFrom ? Number(zoneForm.freeFrom) : null,
      };
      if (editingZoneId) {
        await adminApi.updateDeliveryZone(editingZoneId, payload);
      } else {
        await adminApi.createDeliveryZone({ ...payload, storeId: zoneForm.storeId || stores[0]?.id });
      }
      setShowZoneForm(false);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
    }
  }

  async function deleteZone(id: string) {
    if (!confirm(tr('Удалить эту зону?', "Bu hudud o'chirilsinmi?"))) return;
    try {
      await adminApi.deleteDeliveryZone(id);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
    }
  }

  async function deleteStore(id: string, name: string) {
    const question = tr(
      `Удалить магазин "${name}"? Действие необратимо.`,
      `"${name}" do'koni o'chirilsinmi? Bu amalni ortga qaytarib bo'lmaydi.`
    );
    if (!confirm(question)) return;
    try {
      await adminApi.deleteStore(id);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
    }
  }

  async function testStoreConnection(store: any) {
    try {
      const data = await adminApi.activateStore(store.id);
      const webhookUrl = data?.webhookUrl ? `\nWebhook: ${data.webhookUrl}` : '';
      showNotice('success', tr(`Бот "${store.name}" подключен успешно.${webhookUrl}`, `"${store.name}" boti muvaffaqiyatli ulandi.${webhookUrl}`));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
    }
  }

  async function saveLoyalty() {
    try {
      await adminApi.updateLoyaltyConfig(loyalty);
      showNotice('success', tr('Сохранено', 'Saqlandi'));
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
    }
  }

  const noticeNode = notice ? (
    <div
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 70,
        minWidth: 280,
        maxWidth: 440,
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 14,
        fontWeight: 700,
        boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
        color: notice.tone === 'error' ? '#991b1b' : notice.tone === 'success' ? '#065f46' : '#1e3a8a',
        background: notice.tone === 'error' ? '#fee2e2' : notice.tone === 'success' ? '#d1fae5' : '#dbeafe',
        border: `1px solid ${notice.tone === 'error' ? '#fecaca' : notice.tone === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
      }}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  if (loading) return <p className="sg-subtitle">{tr('Загрузка настроек...', 'Sozlamalar yuklanmoqda...')}</p>;

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}
      <header>
        <h2 className="sg-title">{tr('Настройки', 'Sozlamalar')}</h2>
        <p className="sg-subtitle">{tr('Магазины, доставка, лояльность и Telegram-привязка', "Do'konlar, yetkazib berish, loyallik va Telegram bog'lash")}</p>
      </header>

      <div className="sg-card soft">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800 }}>{tr('Привязка Telegram-админа', 'Telegram adminini bog\'lash')}</p>
            <p className="sg-subtitle" style={{ marginTop: 4 }}>
              {tr('Сгенерируйте код и отправьте боту: /admin CODE', 'Kod yarating va botga yuboring: /admin CODE')}
            </p>
          </div>
          <button className="sg-btn primary" type="button" onClick={generateTelegramLinkCode}>
            {telegramLinkLoading ? tr('Генерация...', 'Yaratilmoqda...') : tr('Сгенерировать код', 'Kod yaratish')}
          </button>
        </div>

        {telegramLinkData && (
          <div className="sg-card" style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              {tr('Код', 'Kod')}: <b style={{ fontFamily: 'monospace' }}>{telegramLinkData.code}</b>
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('Истекает', 'Amal qilish muddati')}: {new Date(telegramLinkData.expiresAt).toLocaleString(locale)}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('Команда', 'Buyruq')}: <span style={{ fontFamily: 'monospace' }}>{telegramLinkData.command}</span>
            </p>
          </div>
        )}
      </div>

      <div className="sg-pill-row">
        <button className={`sg-pill ${tab === 'stores' ? 'active' : ''}`} type="button" onClick={() => setTab('stores')}>
          {tr('Магазины', "Do'konlar")}
        </button>
        <button className={`sg-pill ${tab === 'zones' ? 'active' : ''}`} type="button" onClick={() => setTab('zones')}>
          {tr('Доставка', 'Yetkazib berish')}
        </button>
        <button className={`sg-pill ${tab === 'loyalty' ? 'active' : ''}`} type="button" onClick={() => setTab('loyalty')}>
          {tr('Лояльность', 'Loyallik')}
        </button>
      </div>

      {tab === 'stores' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p className="sg-subtitle" style={{ margin: 0 }}>
              {tr('Один магазин = один Telegram-бот', "Bitta do'kon = bitta Telegram bot")}
            </p>
            <button className="sg-btn primary" type="button" onClick={openCreateStore}>
              + {tr('Магазин', "Do'kon")}
            </button>
          </div>

          {stores.map((store) => (
            <article key={store.id} className="sg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 800 }}>{store.name}</p>
                {store.botUsername && <p style={{ margin: '4px 0 0', color: '#2e7d64', fontSize: 13 }}>@{store.botUsername}</p>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="sg-btn ghost" type="button" onClick={() => openEditStore(store)}>
                  {tr('Изменить', 'Tahrirlash')}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => testStoreConnection(store)}>
                  {tr('Проверить бота', 'Botni tekshirish')}
                </button>
                <button
                  className="sg-btn danger"
                  type="button"
                  disabled={stores.length <= 1}
                  title={stores.length <= 1 ? tr('Нельзя удалить последний магазин', "Oxirgi do'konni o'chirib bo'lmaydi") : undefined}
                  onClick={() => deleteStore(store.id, store.name)}
                >
                  {tr('Удалить', "O'chirish")}
                </button>
              </div>
            </article>
          ))}

          {stores.length === 0 && <p className="sg-subtitle">{tr('Магазинов пока нет', "Hozircha do'konlar yo'q")}</p>}
        </section>
      )}

      {tab === 'zones' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p className="sg-subtitle" style={{ margin: 0 }}>
              {tr('Зоны и тарифы доставки', 'Yetkazib berish hududlari va tariflar')}
            </p>
            <button className="sg-btn primary" type="button" onClick={openCreateZone}>
              + {tr('Зона', 'Hudud')}
            </button>
          </div>

          <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="sg-table">
              <thead>
                <tr>
                  <th>{tr('Зона', 'Hudud')}</th>
                  <th>{tr('Цена', 'Narx')}</th>
                  <th>{tr('Бесплатно от', 'Bepul chegarasi')}</th>
                  <th>{tr('Действия', 'Amallar')}</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td style={{ fontWeight: 700 }}>{zone.name}</td>
                    <td>{Number(zone.price).toLocaleString()} UZS</td>
                    <td>{zone.freeFrom ? `${Number(zone.freeFrom).toLocaleString()} UZS` : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="sg-btn ghost" type="button" onClick={() => openEditZone(zone)}>
                          {tr('Изменить', 'Tahrirlash')}
                        </button>
                        <button className="sg-btn danger" type="button" onClick={() => deleteZone(zone.id)}>
                          {tr('Удалить', "O'chirish")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {zones.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#6b7a71' }}>
                      {tr('Зоны доставки не настроены', 'Yetkazib berish hududlari sozlanmagan')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'loyalty' && loyalty && (
        <section className="sg-card" style={{ maxWidth: 720 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('Программа лояльности', 'Loyallik dasturi')}</h3>
          <p className="sg-subtitle">{tr('Начисления баллов и лимиты скидки', 'Ball berish qoidalari va chegirma limitlari')}</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveLoyalty();
            }}
            className="sg-grid"
            style={{ gap: 12, marginTop: 10 }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={!!loyalty.isEnabled}
                onChange={(e) => setLoyalty({ ...loyalty, isEnabled: e.target.checked })}
              />
              {tr('Включена', 'Yoqilgan')}
            </label>

            <div className="sg-grid cols-2">
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Сумма шага', 'Qadam summasi')}</label>
                <input
                  type="number"
                  value={loyalty.unitAmount || 1000}
                  onChange={(e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Баллов за шаг', 'Qadam uchun ball')}</label>
                <input
                  type="number"
                  value={loyalty.pointsPerUnit || 1}
                  onChange={(e) => setLoyalty({ ...loyalty, pointsPerUnit: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
            </div>

            <div className="sg-grid cols-2">
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Цена 1 балла', '1 ball qiymati')}</label>
                <input
                  type="number"
                  value={loyalty.pointValue || 100}
                  onChange={(e) => setLoyalty({ ...loyalty, pointValue: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Макс. скидка %', 'Maks. chegirma %')}</label>
                <input
                  type="number"
                  value={loyalty.maxDiscountPct || 30}
                  onChange={(e) => setLoyalty({ ...loyalty, maxDiscountPct: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
            </div>

            <button className="sg-btn primary" type="submit">
              {tr('Сохранить', 'Saqlash')}
            </button>
          </form>
        </section>
      )}

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
                <button className="sg-btn primary" type="button" onClick={() => void saveStore()}>
                  {tr('Сохранить', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => setShowStoreForm(false)}>
                  {tr('Отмена', 'Bekor qilish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showZoneForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div className="sg-card" style={{ width: '100%', maxWidth: 520 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {editingZoneId ? tr('Редактировать зону', 'Hududni tahrirlash') : tr('Новая зона', 'Yangi hudud')}
            </h3>

            <div className="sg-grid" style={{ gap: 10, marginTop: 12 }}>
              {!editingZoneId && (
                <select
                  value={zoneForm.storeId}
                  onChange={(e) => setZoneForm({ ...zoneForm, storeId: e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('Название зоны', 'Hudud nomi')}
              />
              <input
                type="number"
                value={zoneForm.price}
                onChange={(e) => setZoneForm({ ...zoneForm, price: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('Цена', 'Narx')}
              />
              <input
                type="number"
                value={zoneForm.freeFrom}
                onChange={(e) => setZoneForm({ ...zoneForm, freeFrom: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('Бесплатно от', 'Bepul chegarasi')}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn primary" type="button" onClick={() => void saveZone()}>
                  {tr('Сохранить', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => setShowZoneForm(false)}>
                  {tr('Отмена', 'Bekor qilish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
