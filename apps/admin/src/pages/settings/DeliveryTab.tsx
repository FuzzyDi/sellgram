import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import type { TabProps } from './types';

// Needs its own copy of `stores` (for the zone-creation dropdown/default
// storeId) — independent from StoresTab's own fetch of the same list.
// Keeps each tab genuinely self-contained per the "simple local state,
// no shared cache" instruction, at the cost of one duplicate API call if
// both tabs are visited in a session.
export default function DeliveryTab({ onNotice }: TabProps) {
  const { tr } = useAdminI18n();
  const [zones, setZones] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteZone, setPendingDeleteZone] = useState<string | null>(null);

  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: '', price: '', freeFrom: '', storeId: '' });

  async function load() {
    setLoading(true);
    try {
      const [zoneList, storeList] = await Promise.all([
        adminApi.getDeliveryZones(),
        adminApi.getStores(),
      ]);
      setZones(Array.isArray(zoneList) ? zoneList : []);
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
    if (saving) return;
    setSaving(true);
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
      onNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(id: string) {
    setPendingDeleteZone(null);
    try {
      await adminApi.deleteDeliveryZone(id);
      await load();
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
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="sg-skeleton" style={{ height: 32, width: 90, borderRadius: 8 }} />
                <div className="sg-skeleton" style={{ height: 32, width: 90, borderRadius: 8 }} />
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
            {tr('Зоны доставки и тарифы', 'Yetkazib berish hududlari va tariflar')}
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
                <th>{tr('Бесплатный порог', 'Bepul chegarasi')}</th>
                <th>{tr('Действия', 'Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => {
                const isConfirming = pendingDeleteZone === zone.id;
                return (
                  <tr key={zone.id}>
                    <td style={{ fontWeight: 700 }}>{zone.name}</td>
                    <td>{Number(zone.price).toLocaleString()} UZS</td>
                    <td>{zone.freeFrom ? `${Number(zone.freeFrom).toLocaleString()} UZS` : '-'}</td>
                    <td>
                      {isConfirming ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>{tr('Удалить?', "O'chirish?")}</span>
                          <button className="sg-btn danger" type="button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => void deleteZone(zone.id)}>
                            {tr('Да', 'Ha')}
                          </button>
                          <button className="sg-btn ghost" type="button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setPendingDeleteZone(null)}>
                            {tr('Нет', "Yo'q")}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="sg-btn ghost" type="button" onClick={() => openEditZone(zone)}>
                            {tr('Редактировать', 'Tahrirlash')}
                          </button>
                          <button className="sg-btn danger" type="button" onClick={() => setPendingDeleteZone(zone.id)}>
                            {tr('Удалить', "O'chirish")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
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
                placeholder={tr('Бесплатный порог', 'Bepul chegarasi')}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn primary" type="button" disabled={saving} onClick={() => void saveZone()}>
                  {saving ? '...' : tr('Сохранить', 'Saqlash')}
                </button>
                <button className="sg-btn ghost" type="button" disabled={saving} onClick={() => setShowZoneForm(false)}>
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
