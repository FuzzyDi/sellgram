import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';

type NoticeTone = 'success' | 'error';

export default function Suppliers() {
  const { tr, locale } = useAdminI18n();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNote, setFormNote] = useState('');

  // PO history drill-down
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [supplierPos, setSupplierPos] = useState<any[]>([]);
  const [loadingPos, setLoadingPos] = useState(false);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getSuppliers();
      setSuppliers(Array.isArray(data) ? data : data.items || []);
    } catch (err: any) {
      if (err?.message?.includes('402') || err?.message?.toLowerCase().includes('plan')) {
        setPlanBlocked(true);
      } else {
        showNotice('error', err?.message || tr('Ошибка загрузки', 'Yuklash xatosi'));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function resetForm() {
    setEditId(null);
    setFormName(''); setFormContact(''); setFormPhone('');
    setFormEmail(''); setFormAddress(''); setFormNote('');
    setShowForm(false);
  }

  function openEdit(s: any) {
    setEditId(s.id);
    setFormName(s.name || '');
    setFormContact(s.contactName || '');
    setFormPhone(s.phone || '');
    setFormEmail(s.email || '');
    setFormAddress(s.address || '');
    setFormNote(s.note || '');
    setShowForm(true);
    setSelectedSupplier(null);
  }

  async function submitForm() {
    if (!formName.trim()) {
      showNotice('error', tr('Введите название контрагента', 'Kontragent nomini kiriting'));
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: formName.trim(),
        contactName: formContact.trim() || undefined,
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
        note: formNote.trim() || undefined,
      };
      if (editId) {
        await adminApi.updateSupplier(editId, data);
        showNotice('success', tr('Контрагент обновлён', 'Kontragent yangilandi'));
      } else {
        await adminApi.createSupplier(data);
        showNotice('success', tr('Контрагент добавлен', 'Kontragent qo\'shildi'));
      }
      resetForm();
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string, name: string) {
    if (!window.confirm(tr(`Архивировать «${name}»?`, `«${name}»ni arxivlashtirasizmi?`))) return;
    setSaving(true);
    try {
      await adminApi.archiveSupplier(id);
      showNotice('success', tr('Контрагент архивирован', 'Kontragent arxivlandi'));
      await load();
      if (selectedSupplier?.id === id) setSelectedSupplier(null);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(s: any) {
    setSelectedSupplier(s);
    setShowForm(false);
    setLoadingPos(true);
    try {
      const data = await adminApi.getSupplier(s.id);
      setSupplierPos(data.purchaseOrders || []);
    } catch {
      setSupplierPos([]);
    } finally {
      setLoadingPos(false);
    }
  }

  const noticeNode = notice ? (
    <div
      className={[
        'fixed top-[18px] right-[18px] z-[70] min-w-[280px] max-w-[440px] rounded-token-lg px-3.5 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  const poColumns: TableColumn<any>[] = [
    { key: 'po', header: 'PO#', render: (po) => <span className="font-semibold text-neutral-800">PO-{po.poNumber}</span> },
    { key: 'date', header: tr('Дата', 'Sana'), render: (po) => new Date(po.createdAt).toLocaleDateString(locale) },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (po) => {
        const variant = po.status === 'RECEIVED' ? 'success'
          : po.status === 'CANCELLED' ? 'danger'
          : po.status === 'ORDERED' ? 'info'
          : po.status === 'IN_TRANSIT' ? 'warning'
          : 'neutral';
        const label = po.status === 'DRAFT' ? tr('Черновик', 'Qoralama')
          : po.status === 'ORDERED' ? tr('Заказан', 'Buyurtma berildi')
          : po.status === 'IN_TRANSIT' ? tr('В пути', "Yo'lda")
          : po.status === 'RECEIVED' ? tr('Получен', 'Qabul qilindi')
          : tr('Отменён', 'Bekor qilindi');
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    { key: 'total', header: tr('Сумма', 'Summa'), render: (po) => Number(po.totalCost).toLocaleString(locale) },
    { key: 'currency', header: tr('Валюта', 'Valyuta'), render: (po) => po.currency },
  ];

  if (planBlocked) {
    return (
      <section className="flex flex-col gap-4">
        <header><h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Контрагенты', 'Kontragentlar')}</h2></header>
        <Card className="text-center py-8 px-4">
          <div className="text-token-2xl mb-3">🔒</div>
          <p className="m-0 font-semibold text-token-lg text-neutral-800">{tr('Доступно на PRO и BUSINESS', 'PRO va BUSINESS tariflarida mavjud')}</p>
          <p className="mt-1.5 text-token-sm text-neutral-500">{tr('Управление контрагентами доступно с тарифом PRO', 'Kontragentlarni boshqarish PRO tarifidan mavjud')}</p>
          <Button variant="primary" size="md" type="button" className="mt-4" onClick={() => navigate('/billing')}>
            {tr('Обновить тариф', 'Tarifni yangilash')}
          </Button>
        </Card>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <div className="h-7 w-[35%] rounded-token-sm bg-neutral-100 animate-pulse" />
          <div className="h-3.5 w-1/2 rounded-token-sm bg-neutral-100 animate-pulse mt-2" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <div className="h-5 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse mb-2" />
            <div className="h-3.5 w-[65%] rounded-token-sm bg-neutral-100 animate-pulse" />
          </Card>
        ))}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Контрагенты', 'Kontragentlar')}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">{tr('Поставщики и история заказов', 'Yetkazib beruvchilar va buyurtmalar tarixi')}</p>
        </div>
        <Button variant="primary" size="md" type="button" onClick={() => { resetForm(); setShowForm(true); }} disabled={showForm && !editId}>
          + {tr('Новый контрагент', 'Yangi kontragent')}
        </Button>
      </header>

      {/* Create / Edit form */}
      {showForm && (
        <Card className="flex flex-col gap-3">
          <h3 className="m-0 text-token-base font-semibold text-neutral-800">
            {editId ? tr('Редактировать контрагента', 'Kontragentni tahrirlash') : tr('Новый контрагент', 'Yangi kontragent')}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="sm:col-span-2">
              <Input
                label={tr('Название *', 'Nomi *')}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={tr('ООО «Поставщик»', 'Yetkazib beruvchi MChJ')}
              />
            </div>
            <Input
              label={tr('Контактное лицо', 'Aloqa shaxsi')}
              value={formContact}
              onChange={(e) => setFormContact(e.target.value)}
              placeholder={tr('Иван Иванов', 'Ivan Ivanov')}
            />
            <Input
              label={tr('Телефон', 'Telefon')}
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="+998 90 000 00 00"
            />
            <Input
              type="email"
              label="Email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="supplier@example.com"
            />
            <Input
              label={tr('Адрес', 'Manzil')}
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              placeholder={tr('г. Ташкент, ул. ...', 'Toshkent sh., ...')}
            />
            <Input
              label={tr('Заметка', 'Izoh')}
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="md" type="button" onClick={resetForm} disabled={saving}>{tr('Отмена', 'Bekor')}</Button>
            <Button variant="primary" size="md" type="button" onClick={submitForm} disabled={saving}>
              {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
            </Button>
          </div>
        </Card>
      )}

      {/* Suppliers list */}
      {suppliers.length === 0 && !showForm ? (
        <Card className="text-center py-10 px-4">
          <p className="text-token-sm text-neutral-500">{tr('Контрагентов пока нет. Добавьте первого поставщика.', 'Hali kontragentlar yo\'q. Birinchi yetkazib beruvchini qo\'shing.')}</p>
        </Card>
      ) : (
        suppliers.map((s: any) => (
          <Card key={s.id}>
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-token-base text-neutral-800">{s.name}</div>
                {(s.contactName || s.phone || s.email) && (
                  <p className="mt-1 mb-0 text-token-sm text-neutral-600">
                    {[s.contactName, s.phone, s.email].filter(Boolean).join(' · ')}
                  </p>
                )}
                {s.address && <p className="mt-0.5 mb-0 text-token-xs text-neutral-500">{s.address}</p>}
                {s.note && <p className="mt-0.5 mb-0 text-token-xs text-neutral-500 italic">{s.note}</p>}
                <p className="mt-1 mb-0 text-token-xs text-neutral-400">
                  {tr('Добавлен', 'Qo\'shilgan')}: {new Date(s.createdAt).toLocaleDateString(locale)}
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Button variant="ghost" size="sm" type="button" disabled={saving} onClick={() => openHistory(s)}>
                  {tr('История заказов', 'Buyurtmalar tarixi')}
                </Button>
                <Button variant="ghost" size="sm" type="button" disabled={saving} onClick={() => openEdit(s)}>
                  {tr('Изменить', 'Tahrirlash')}
                </Button>
                <Button variant="danger" size="sm" type="button" disabled={saving} onClick={() => archive(s.id, s.name)}>
                  {tr('Архивировать', 'Arxivlashtirish')}
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}

      {/* PO history panel */}
      {selectedSupplier && (
        <Card>
          <div className="flex justify-between items-center mb-3">
            <h3 className="m-0 text-token-base font-semibold text-neutral-800">
              {tr('История заказов', 'Buyurtmalar tarixi')}: {selectedSupplier.name}
            </h3>
            <Button variant="ghost" size="sm" type="button" onClick={() => setSelectedSupplier(null)}>✕</Button>
          </div>

          {loadingPos ? (
            <div className="h-20 rounded-token-md bg-neutral-100 animate-pulse" />
          ) : supplierPos.length === 0 ? (
            <p className="text-token-sm text-neutral-500">{tr('Заказов от этого поставщика пока нет', 'Bu yetkazib beruvchidan hali buyurtmalar yo\'q')}</p>
          ) : (
            <Table columns={poColumns} data={supplierPos} rowKey={(po) => po.id} />
          )}
        </Card>
      )}
    </section>
  );
}
