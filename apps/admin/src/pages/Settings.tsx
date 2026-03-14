import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
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
        const payload: any = {
          name: storeForm.name,
          welcomeMessage: storeForm.welcomeMessage,
        };
        if (storeForm.botToken) payload.botToken = storeForm.botToken;
        await adminApi.updateStore(editingStoreId, payload);
      } else {
        if (!storeForm.name || !storeForm.botToken) {
          alert(tr('РќСѓР¶РЅС‹ РЅР°Р·РІР°РЅРёРµ РјР°РіР°Р·РёРЅР° Рё bot token', "Do'kon nomi va bot token kerak"));
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
      alert(err.message);
    }
  }

  async function deleteZone(id: string) {
    if (!confirm(tr('РЈРґР°Р»РёС‚СЊ СЌС‚Сѓ Р·РѕРЅСѓ?', "Bu hudud o'chirilsinmi?"))) return;
    try {
      await adminApi.deleteDeliveryZone(id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }
  async function deleteStore(id: string, name: string) {
    const question = tr(
      `Delete store "${name}"? This action cannot be undone.`,
      `"${name}" do'koni o'chirilsinmi? Bu amalni ortga qaytarib bo'lmaydi.`
    );
    if (!confirm(question)) return;
    try {
      await adminApi.deleteStore(id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }
  async function saveLoyalty() {
    try {
      await adminApi.updateLoyaltyConfig(loyalty);
      alert(tr('РЎРѕС…СЂР°РЅРµРЅРѕ', 'Saqlandi'));
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) return <p className="sg-subtitle">{tr('Р—Р°РіСЂСѓР·РєР° РЅР°СЃС‚СЂРѕРµРє...', 'Sozlamalar yuklanmoqda...')}</p>;

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header>
        <h2 className="sg-title">{tr('РќР°СЃС‚СЂРѕР№РєРё', 'Sozlamalar')}</h2>
        <p className="sg-subtitle">{tr('РњР°РіР°Р·РёРЅС‹, РґРѕСЃС‚Р°РІРєР°, Р»РѕСЏР»СЊРЅРѕСЃС‚СЊ Рё Telegram-РїСЂРёРІСЏР·РєР°', "Do'konlar, yetkazib berish, loyallik va Telegram bog'lash")}</p>
      </header>

      <div className="sg-card soft">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800 }}>{tr('РџСЂРёРІСЏР·РєР° Telegram-Р°РґРјРёРЅР°', "Telegram adminini bog'lash")}</p>
            <p className="sg-subtitle" style={{ marginTop: 4 }}>
              {tr('РЎРіРµРЅРµСЂРёСЂСѓР№С‚Рµ РєРѕРґ Рё РѕС‚РїСЂР°РІСЊС‚Рµ Р±РѕС‚Сѓ: /admin CODE', 'Kod yarating va botga yuboring: /admin CODE')}
            </p>
          </div>
          <button className="sg-btn primary" type="button" onClick={generateTelegramLinkCode}>
            {telegramLinkLoading ? tr('Р“РµРЅРµСЂР°С†РёСЏ...', 'Yaratilmoqda...') : tr('РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РєРѕРґ', 'Kod yaratish')}
          </button>
        </div>

        {telegramLinkData && (
          <div className="sg-card" style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              {tr('РљРѕРґ', 'Kod')}: <b style={{ fontFamily: 'monospace' }}>{telegramLinkData.code}</b>
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('РСЃС‚РµРєР°РµС‚', 'Amal qilish muddati')}: {new Date(telegramLinkData.expiresAt).toLocaleString(locale)}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#65746b' }}>
              {tr('РљРѕРјР°РЅРґР°', 'Buyruq')}: <span style={{ fontFamily: 'monospace' }}>{telegramLinkData.command}</span>
            </p>
          </div>
        )}
      </div>

      <div className="sg-pill-row">
        <button className={`sg-pill ${tab === 'stores' ? 'active' : ''}`} type="button" onClick={() => setTab('stores')}>
          {tr('РњР°РіР°Р·РёРЅС‹', "Do'konlar")}
        </button>
        <button className={`sg-pill ${tab === 'zones' ? 'active' : ''}`} type="button" onClick={() => setTab('zones')}>
          {tr('Р”РѕСЃС‚Р°РІРєР°', 'Yetkazib berish')}
        </button>
        <button className={`sg-pill ${tab === 'loyalty' ? 'active' : ''}`} type="button" onClick={() => setTab('loyalty')}>
          {tr('Р›РѕСЏР»СЊРЅРѕСЃС‚СЊ', 'Loyallik')}
        </button>
      </div>

      {tab === 'stores' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p className="sg-subtitle" style={{ margin: 0 }}>
              {tr('РћРґРёРЅ РјР°РіР°Р·РёРЅ = РѕРґРёРЅ Telegram-Р±РѕС‚', "Bitta do'kon = bitta Telegram bot")}
            </p>
            <button className="sg-btn primary" type="button" onClick={openCreateStore}>
              + {tr('РњР°РіР°Р·РёРЅ', "Do'kon")}
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
                  {tr('РР·РјРµРЅРёС‚СЊ', 'Tahrirlash')}
                </button>
                <button
                  className="sg-btn danger"
                  type="button"
                  disabled={stores.length <= 1}
                  title={stores.length <= 1 ? tr('Нельзя удалить последний магазин', "Oxirgi do'konni o'chirib bo'lmaydi") : undefined}
                  onClick={() => deleteStore(store.id, store.name)}
                >
                  {tr('РЈРґР°Р»РёС‚СЊ', "O'chirish")}
                </button>
              </div>
            </article>
          ))}

          {stores.length === 0 && <p className="sg-subtitle">{tr('РњР°РіР°Р·РёРЅРѕРІ РїРѕРєР° РЅРµС‚', "Hozircha do'konlar yo'q")}</p>}
        </section>
      )}

      {tab === 'zones' && (
        <section className="sg-grid" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p className="sg-subtitle" style={{ margin: 0 }}>
              {tr('Р—РѕРЅС‹ Рё С‚Р°СЂРёС„С‹ РґРѕСЃС‚Р°РІРєРё', 'Yetkazib berish hududlari va tariflar')}
            </p>
            <button className="sg-btn primary" type="button" onClick={openCreateZone}>
              + {tr('Р—РѕРЅР°', 'Hudud')}
            </button>
          </div>

          <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="sg-table">
              <thead>
                <tr>
                  <th>{tr('Р—РѕРЅР°', 'Hudud')}</th>
                  <th>{tr('Р¦РµРЅР°', 'Narx')}</th>
                  <th>{tr('Р‘РµСЃРїР»Р°С‚РЅРѕ РѕС‚', 'Bepul chegarasi')}</th>
                  <th>{tr('Р”РµР№СЃС‚РІРёСЏ', 'Amallar')}</th>
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
                          {tr('РР·РјРµРЅРёС‚СЊ', 'Tahrirlash')}
                        </button>
                        <button className="sg-btn danger" type="button" onClick={() => deleteZone(zone.id)}>
                          {tr('РЈРґР°Р»РёС‚СЊ', "O'chirish")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {zones.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#6b7a71' }}>
                      {tr('Р—РѕРЅС‹ РґРѕСЃС‚Р°РІРєРё РЅРµ РЅР°СЃС‚СЂРѕРµРЅС‹', 'Yetkazib berish hududlari sozlanmagan')}
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
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('РџСЂРѕРіСЂР°РјРјР° Р»РѕСЏР»СЊРЅРѕСЃС‚Рё', 'Loyallik dasturi')}</h3>
          <p className="sg-subtitle">{tr('РќР°С‡РёСЃР»РµРЅРёСЏ Р±Р°Р»Р»РѕРІ Рё Р»РёРјРёС‚С‹ СЃРєРёРґРєРё', 'Ball berish qoidalari va chegirma limitlari')}</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveLoyalty();
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
              {tr('Р’РєР»СЋС‡РµРЅР°', 'Yoqilgan')}
            </label>

            <div className="sg-grid cols-2">
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('РЎСѓРјРјР° С€Р°РіР°', 'Qadam summasi')}</label>
                <input
                  type="number"
                  value={loyalty.unitAmount || 1000}
                  onChange={(e) => setLoyalty({ ...loyalty, unitAmount: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Р‘Р°Р»Р»РѕРІ Р·Р° С€Р°Рі', 'Qadam uchun ball')}</label>
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
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('Р¦РµРЅР° 1 Р±Р°Р»Р»Р°', '1 ball qiymati')}</label>
                <input
                  type="number"
                  value={loyalty.pointValue || 100}
                  onChange={(e) => setLoyalty({ ...loyalty, pointValue: +e.target.value })}
                  className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#5f6d64', marginBottom: 6 }}>{tr('РњР°РєСЃ. СЃРєРёРґРєР° %', 'Maks. chegirma %')}</label>
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
              {tr('РЎРѕС…СЂР°РЅРёС‚СЊ', 'Saqlash')}
            </button>
          </form>
        </section>
      )}

      {showStoreForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div className="sg-card" style={{ width: '100%', maxWidth: 520 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {editingStoreId ? tr('Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РјР°РіР°Р·РёРЅ', "Do'konni tahrirlash") : tr('РќРѕРІС‹Р№ РјР°РіР°Р·РёРЅ', "Yangi do'kon")}
            </h3>

            <div className="sg-grid" style={{ gap: 10, marginTop: 12 }}>
              <input
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('РќР°Р·РІР°РЅРёРµ РјР°РіР°Р·РёРЅР°', "Do'kon nomi")}
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
                placeholder={tr('РџСЂРёРІРµС‚СЃС‚РІРµРЅРЅРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ', 'Xush kelibsiz xabari')}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn primary" type="button" onClick={saveStore}>
                  {tr('РЎРѕС…СЂР°РЅРёС‚СЊ', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => setShowStoreForm(false)}>
                  {tr('РћС‚РјРµРЅР°', 'Bekor qilish')}
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
              {editingZoneId ? tr('Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ Р·РѕРЅСѓ', 'Hududni tahrirlash') : tr('РќРѕРІР°СЏ Р·РѕРЅР°', 'Yangi hudud')}
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
                placeholder={tr('РќР°Р·РІР°РЅРёРµ Р·РѕРЅС‹', 'Hudud nomi')}
              />
              <input
                type="number"
                value={zoneForm.price}
                onChange={(e) => setZoneForm({ ...zoneForm, price: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('Р¦РµРЅР°', 'Narx')}
              />
              <input
                type="number"
                value={zoneForm.freeFrom}
                onChange={(e) => setZoneForm({ ...zoneForm, freeFrom: e.target.value })}
                className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px' }}
                placeholder={tr('Р‘РµСЃРїР»Р°С‚РЅРѕ РѕС‚', 'Bepul chegarasi')}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn primary" type="button" onClick={saveZone}>
                  {tr('РЎРѕС…СЂР°РЅРёС‚СЊ', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => setShowZoneForm(false)}>
                  {tr('РћС‚РјРµРЅР°', 'Bekor qilish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}


