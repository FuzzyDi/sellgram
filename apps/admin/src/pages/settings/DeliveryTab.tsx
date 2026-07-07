import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Table, { type TableColumn } from '../../components/Table';
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

  const columns: TableColumn<any>[] = [
    { key: 'name', header: tr('Зона', 'Hudud'), render: (zone) => <span className="font-semibold text-neutral-800">{zone.name}</span> },
    { key: 'price', header: tr('Цена', 'Narx'), render: (zone) => `${Number(zone.price).toLocaleString()} UZS` },
    {
      key: 'freeFrom',
      header: tr('Бесплатный порог', 'Bepul chegarasi'),
      render: (zone) => (zone.freeFrom ? `${Number(zone.freeFrom).toLocaleString()} UZS` : '-'),
    },
    {
      key: 'actions',
      header: tr('Действия', 'Amallar'),
      render: (zone) => {
        const isConfirming = pendingDeleteZone === zone.id;
        return isConfirming ? (
          <div className="flex gap-1.5 items-center">
            <span className="text-token-xs font-medium text-warning">{tr('Удалить?', "O'chirish?")}</span>
            <Button variant="danger" size="sm" type="button" onClick={() => void deleteZone(zone.id)}>
              {tr('Да', 'Ha')}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setPendingDeleteZone(null)}>
              {tr('Нет', "Yo'q")}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => openEditZone(zone)}>
              {tr('Редактировать', 'Tahrirlash')}
            </Button>
            <Button variant="danger" size="sm" type="button" onClick={() => setPendingDeleteZone(zone.id)}>
              {tr('Удалить', "O'chirish")}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-token-sm text-neutral-500">
            {tr('Зоны доставки и тарифы', 'Yetkazib berish hududlari va tariflar')}
          </p>
          <Button variant="primary" size="md" type="button" onClick={openCreateZone}>
            + {tr('Зона', 'Hudud')}
          </Button>
        </div>

        <Table
          columns={columns}
          data={zones}
          rowKey={(zone) => zone.id}
          loading={loading}
          emptyMessage={tr('Зоны доставки не настроены', 'Yetkazib berish hududlari sozlanmagan')}
        />
      </section>

      {showZoneForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-[520px]">
            <h3 className="m-0 text-token-xl font-semibold text-neutral-800">
              {editingZoneId ? tr('Редактировать зону', 'Hududni tahrirlash') : tr('Новая зона', 'Yangi hudud')}
            </h3>

            <div className="flex flex-col gap-3 mt-3">
              {!editingZoneId && (
                <Select
                  value={zoneForm.storeId}
                  onChange={(e) => setZoneForm({ ...zoneForm, storeId: e.target.value })}
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </Select>
              )}
              <Input
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                placeholder={tr('Название зоны', 'Hudud nomi')}
              />
              <Input
                type="number"
                value={zoneForm.price}
                onChange={(e) => setZoneForm({ ...zoneForm, price: e.target.value })}
                placeholder={tr('Цена', 'Narx')}
              />
              <Input
                type="number"
                value={zoneForm.freeFrom}
                onChange={(e) => setZoneForm({ ...zoneForm, freeFrom: e.target.value })}
                placeholder={tr('Бесплатный порог', 'Bepul chegarasi')}
              />
              <div className="flex gap-2.5">
                <Button variant="primary" size="md" type="button" disabled={saving} onClick={() => void saveZone()}>
                  {saving ? '...' : tr('Сохранить', 'Saqlash')}
                </Button>
                <Button variant="ghost" size="md" type="button" disabled={saving} onClick={() => setShowZoneForm(false)}>
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
