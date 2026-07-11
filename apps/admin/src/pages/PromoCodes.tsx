import React, { useEffect, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Select from '../components/Select';
import Badge from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';

export default function PromoCodes() {
  const { tr } = useAdminI18n();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', type: 'PERCENT', value: '', minOrder: '', maxUses: '', expiresAt: '' });
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true); setLoadError(false);
    try { setItems((await adminApi.getPromoCodes()).data ?? []); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.code || !form.value) { setFormError(tr('Заполните код и скидку', "Kod va chegirmani to'ldiring")); return; }
    setSaving(true); setFormError('');
    try {
      await adminApi.createPromoCode({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        minOrder: form.minOrder ? Number(form.minOrder) : undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        expiresAt: form.expiresAt || undefined,
      });
      setShowForm(false);
      setForm({ code: '', type: 'PERCENT', value: '', minOrder: '', maxUses: '', expiresAt: '' });
      await load();
    } catch (e: any) {
      setFormError(e.message || tr('Ошибка', 'Xato'));
    } finally { setSaving(false); }
  }

  async function toggleActive(id: string, isActive: boolean) {
    setTogglingId(id);
    try { await adminApi.updatePromoCode(id, { isActive: !isActive }); await load(); } catch {}
    finally { setTogglingId(null); }
  }

  async function handleDelete(id: string) {
    try { await adminApi.deletePromoCode(id); setDeleteId(null); await load(); } catch {}
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'code',
      header: tr('Код', 'Kod'),
      render: (item) => <span className="font-mono font-bold text-token-sm text-accent-600">{item.code}</span>,
    },
    {
      key: 'value',
      header: tr('Скидка', 'Chegirma'),
      render: (item) => (
        <span className="font-semibold text-neutral-800">
          {item.type === 'PERCENT' ? `${item.value}%` : `${Number(item.value).toLocaleString()} UZS`}
        </span>
      ),
    },
    {
      key: 'minOrder',
      header: tr('Мин. сумма', 'Min. summa'),
      render: (item) => (item.minOrderAmount ? Number(item.minOrderAmount).toLocaleString() : '—'),
    },
    {
      key: 'usage',
      header: tr('Использований', 'Foydalanish'),
      render: (item) => `${item.usedCount}${item.maxUses ? `/${item.maxUses}` : ''}`,
    },
    {
      key: 'expires',
      header: tr('Действует до', 'Amal qilish muddati'),
      render: (item) => {
        if (!item.expiresAt) return '—';
        const expired = new Date(item.expiresAt) < new Date();
        return <span className={expired ? 'text-danger' : 'text-neutral-600'}>{new Date(item.expiresAt).toLocaleDateString()}</span>;
      },
    },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (item) => {
        const expired = item.expiresAt && new Date(item.expiresAt) < new Date();
        const exhausted = item.maxUses != null && item.usedCount >= item.maxUses;
        if (expired) return <Badge variant="danger">{tr('Истёк', "Muddati o'tgan")}</Badge>;
        if (exhausted) return <Badge variant="danger">{tr('Исчерпан', 'Tugagan')}</Badge>;
        return item.isActive
          ? <Badge variant="success">{tr('Активен', 'Faol')}</Badge>
          : <Badge variant="neutral">{tr('Выключен', "O'chirilgan")}</Badge>;
      },
    },
    {
      key: 'actions',
      header: tr('Действия', 'Amallar'),
      render: (item) => (
        deleteId === item.id ? (
          <div className="flex gap-1.5 items-center">
            <Button variant="danger" size="sm" type="button" onClick={() => handleDelete(item.id)}>{tr('Удалить', "O'chirish")}</Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setDeleteId(null)}>{tr('Отмена', 'Bekor')}</Button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" type="button" disabled={togglingId === item.id} onClick={() => toggleActive(item.id, item.isActive)}>
              {togglingId === item.id ? '…' : item.isActive ? tr('Выкл.', "O'ch.") : tr('Вкл.', 'Yoq.')}
            </Button>
            <Button variant="danger" size="sm" type="button" onClick={() => setDeleteId(item.id)}>✕</Button>
          </div>
        )
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Промокоды', 'Promokodlar')}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">{tr('Скидочные коды для клиентов', 'Mijozlar uchun chegirma kodlari')}</p>
        </div>
        <Button variant="primary" size="md" type="button" onClick={() => { setShowForm(true); setFormError(''); }}>
          + {tr('Создать', 'Yaratish')}
        </Button>
      </header>

      {showForm && (
        <Card>
          <h3 className="m-0 mb-3 text-token-base font-semibold text-neutral-800">{tr('Новый промокод', 'Yangi promokod')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input
              label={`${tr('Код', 'Kod')} *`}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="SUMMER20"
            />
            <Select label={tr('Тип', 'Tur')} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="PERCENT">% {tr('от суммы', 'summadan')}</option>
              <option value="FIXED">{tr('Фикс. сумма', 'Belgilangan summa')}</option>
            </Select>
            <Input
              type="number"
              label={`${tr('Размер скидки', 'Chegirma miqdori')} *`}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder={form.type === 'PERCENT' ? '10' : '5000'}
            />
            <Input
              type="number"
              label={tr('Мин. сумма заказа', 'Min. buyurtma summasi')}
              value={form.minOrder}
              onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))}
              placeholder="50000"
            />
            <Input
              type="number"
              label={tr('Макс. использований', 'Maks. foydalanish')}
              value={form.maxUses}
              onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
              placeholder={tr('Без лимита', 'Limit yoq')}
            />
            <Input
              type="date"
              label={tr('Действует до', 'Amal qilish muddati')}
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            />
          </div>
          {formError && <p className="text-token-sm text-danger mb-3">{formError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" size="md" type="button" onClick={handleCreate} disabled={saving}>
              {saving ? '...' : tr('Сохранить', 'Saqlash')}
            </Button>
            <Button variant="ghost" size="md" type="button" onClick={() => setShowForm(false)}>
              {tr('Отмена', 'Bekor')}
            </Button>
          </div>
        </Card>
      )}

      {loadError ? (
        <Card className="text-center py-8 px-4">
          <p className="m-0 mb-3 text-danger">{tr('Ошибка загрузки', 'Yuklashda xato')}</p>
          <Button variant="primary" size="md" type="button" onClick={load}>{tr('Повторить', 'Qayta')}</Button>
        </Card>
      ) : (
        <Table
          columns={columns}
          data={items}
          rowKey={(item) => item.id}
          loading={loading}
          emptyMessage={tr('Промокодов нет', "Promokodlar yo'q")}
        />
      )}
    </section>
  );
}
