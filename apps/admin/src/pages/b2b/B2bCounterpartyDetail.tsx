import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import {
  COUNTERPARTY_TYPES, COUNTERPARTY_TYPE_BADGE, LEDGER_TYPE_BADGE, ledgerTypeLabel, debtClassName,
  type CounterpartyType,
} from './b2b-shared';

type NoticeTone = 'success' | 'error';
type DetailTab = 'prices' | 'ledger' | 'ops';

interface EditFormState {
  name: string;
  type: CounterpartyType;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  note: string;
}

export default function B2bCounterpartyDetail() {
  const { id } = useParams<{ id: string }>();
  const { tr, locale } = useAdminI18n();
  const navigate = useNavigate();

  const [counterparty, setCounterparty] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<DetailTab>('prices');

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  const [prices, setPrices] = useState<any[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [priceForm, setPriceForm] = useState({ productId: '', variantId: '', price: '' });

  const [ledger, setLedger] = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(true);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [adjustmentDelta, setAdjustmentDelta] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  function typeLabel(type: string) {
    const found = COUNTERPARTY_TYPES.find((t) => t.value === type);
    return found ? tr(found.ru, found.uz) : type;
  }

  async function loadCounterparty() {
    if (!id) return;
    setLoading(true);
    try {
      const data = await adminApi.getCounterparty(id);
      setCounterparty(data);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить контрагента', "Kontragentni yuklab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  }

  async function loadPrices() {
    if (!id) return;
    setLoadingPrices(true);
    try {
      const data = await adminApi.getCounterpartyPrices(id);
      setPrices(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить прайс-лист', "Narxlar ro'yxatini yuklab bo'lmadi"));
    } finally {
      setLoadingPrices(false);
    }
  }

  async function loadLedger() {
    if (!id) return;
    setLoadingLedger(true);
    try {
      const data = await adminApi.getCounterpartyLedger(id, 'pageSize=100');
      setLedger(Array.isArray(data?.items) ? data.items : []);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить историю долга', "Qarz tarixini yuklab bo'lmadi"));
    } finally {
      setLoadingLedger(false);
    }
  }

  async function loadProducts() {
    try {
      const data = await adminApi.getProducts('pageSize=500');
      setProducts(Array.isArray(data?.items ?? data) ? (data?.items ?? data) : []);
    } catch {
      setProducts([]);
    }
  }

  useEffect(() => {
    void loadCounterparty();
    void loadPrices();
    void loadLedger();
    void loadProducts();
  }, [id]);

  function openEdit() {
    if (!counterparty) return;
    setEditForm({
      name: counterparty.name,
      type: counterparty.type,
      phone: counterparty.phone || '',
      email: counterparty.email || '',
      address: counterparty.address || '',
      taxId: counterparty.taxId || '',
      note: counterparty.note || '',
    });
    setEditOpen(true);
  }

  const canSaveEdit = useMemo(() => {
    if (!editForm) return false;
    if (!editForm.name.trim()) return false;
    if (editForm.type === 'ORGANIZATION' && !editForm.taxId.trim()) return false;
    return true;
  }, [editForm]);

  async function submitEdit() {
    if (!id || !editForm || !canSaveEdit) return;
    setSaving(true);
    try {
      await adminApi.updateCounterparty(id, {
        name: editForm.name.trim(),
        type: editForm.type,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        address: editForm.address.trim() || null,
        taxId: editForm.type === 'ORGANIZATION' ? editForm.taxId.trim() : null,
        note: editForm.note.trim() || null,
      });
      setEditOpen(false);
      showNotice('success', tr('Контрагент обновлён', 'Kontragent yangilandi'));
      await loadCounterparty();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!id || !counterparty) return;
    setSaving(true);
    try {
      await adminApi.updateCounterparty(id, { isActive: !counterparty.isActive });
      await loadCounterparty();
      showNotice('success', counterparty.isActive
        ? tr('Контрагент деактивирован', "Kontragent o'chirildi")
        : tr('Контрагент активирован', 'Kontragent faollashtirildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  const selectedProduct = useMemo(
    () => products.find((p: any) => p.id === priceForm.productId),
    [products, priceForm.productId]
  );

  async function submitPrice() {
    if (!id || !priceForm.productId || !priceForm.price) return;
    setSaving(true);
    try {
      await adminApi.upsertCounterpartyPrice(id, {
        productId: priceForm.productId,
        variantId: priceForm.variantId || null,
        price: Number(priceForm.price),
      });
      setPriceForm({ productId: '', variantId: '', price: '' });
      showNotice('success', tr('Цена сохранена', 'Narx saqlandi'));
      await loadPrices();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removePrice(priceId: string) {
    if (!id) return;
    setSaving(true);
    try {
      await adminApi.deleteCounterpartyPrice(id, priceId);
      showNotice('success', tr('Цена удалена', "Narx o'chirildi"));
      await loadPrices();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment() {
    if (!id || !paymentAmount || Number(paymentAmount) <= 0) return;
    setSaving(true);
    try {
      await adminApi.recordCounterpartyPayment(id, {
        amount: Number(paymentAmount),
        note: paymentNote.trim() || undefined,
      });
      setPaymentAmount('');
      setPaymentNote('');
      showNotice('success', tr('Платёж записан', "To'lov qayd etildi"));
      await Promise.all([loadCounterparty(), loadLedger()]);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjustment() {
    if (!id || !adjustmentDelta || Number(adjustmentDelta) === 0 || !adjustmentNote.trim()) return;
    setSaving(true);
    try {
      await adminApi.recordCounterpartyAdjustment(id, {
        delta: Number(adjustmentDelta),
        note: adjustmentNote.trim(),
      });
      setAdjustmentDelta('');
      setAdjustmentNote('');
      showNotice('success', tr('Корректировка сохранена', 'Tuzatish saqlandi'));
      await Promise.all([loadCounterparty(), loadLedger()]);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlashda xato'));
    } finally {
      setSaving(false);
    }
  }

  const priceColumns: TableColumn<any>[] = [
    { key: 'product', header: tr('Товар', 'Mahsulot'), render: (p) => p.product?.name || '—' },
    { key: 'variant', header: tr('Вариант', 'Variant'), render: (p) => p.variant?.name || '—' },
    { key: 'price', header: tr('Цена', 'Narx'), render: (p) => Number(p.price).toLocaleString(locale) },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <Button variant="danger" size="sm" type="button" onClick={() => removePrice(p.id)} disabled={saving}>
          {tr('Удалить', "O'chirish")}
        </Button>
      ),
    },
  ];

  const ledgerColumns: TableColumn<any>[] = [
    { key: 'date', header: tr('Дата', 'Sana'), render: (l) => new Date(l.createdAt).toLocaleString(locale) },
    {
      key: 'type',
      header: tr('Тип', 'Turi'),
      render: (l) => <Badge variant={LEDGER_TYPE_BADGE[l.type] || 'neutral'}>{ledgerTypeLabel(l.type, tr)}</Badge>,
    },
    {
      key: 'delta',
      header: tr('Сумма', 'Summa'),
      render: (l) => (
        <span className={`font-semibold ${debtClassName(Number(l.delta))}`}>
          {Number(l.delta) > 0 ? '+' : ''}{Number(l.delta).toLocaleString(locale)}
        </span>
      ),
    },
    { key: 'note', header: tr('Заметка', 'Eslatma'), render: (l) => l.note || '—' },
    {
      key: 'dueDate',
      header: tr('Срок погашения', "To'lov muddati"),
      render: (l) => (l.type === 'ORDER_CHARGE' && l.dueDate ? new Date(l.dueDate).toLocaleDateString(locale) : '—'),
    },
  ];

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

  if (loading || !counterparty) {
    return (
      <section className="flex flex-col gap-4">
        <div className="h-7 w-[35%] rounded-token-sm bg-neutral-100 animate-pulse" />
        <div className="h-32 rounded-token-lg bg-neutral-100 animate-pulse" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" type="button" onClick={() => navigate('/b2b/counterparties')} className="mb-1.5">
            &larr; {tr('К списку', "Ro'yxatga")}
          </Button>
          <h2 className="text-token-2xl font-semibold text-neutral-800 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-channel-b2b" aria-hidden="true" />
            {counterparty.name}
            <Badge variant={COUNTERPARTY_TYPE_BADGE[counterparty.type as CounterpartyType] || 'neutral'}>
              {typeLabel(counterparty.type)}
            </Badge>
            {counterparty.isActive
              ? <Badge variant="success">{tr('Активен', 'Faol')}</Badge>
              : <Badge variant="neutral">{tr('Отключён', "O'chirilgan")}</Badge>}
          </h2>
        </div>
      </header>

      <Card>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-token-sm">
            <div><span className="text-neutral-500">{tr('Телефон', 'Telefon')}: </span>{counterparty.phone || '—'}</div>
            <div><span className="text-neutral-500">Email: </span>{counterparty.email || '—'}</div>
            <div><span className="text-neutral-500">{tr('Адрес', 'Manzil')}: </span>{counterparty.address || '—'}</div>
            {counterparty.type === 'ORGANIZATION' && (
              <div><span className="text-neutral-500">{tr('ИНН', 'STIR')}: </span>{counterparty.taxId || '—'}</div>
            )}
            <div>
              <span className="text-neutral-500">{tr('Долг', 'Qarz')}: </span>
              <span className={`font-semibold ${debtClassName(Number(counterparty.currentDebt))}`}>
                {Number(counterparty.currentDebt).toLocaleString(locale)}
              </span>
            </div>
            {counterparty.note && (
              <div className="col-span-2"><span className="text-neutral-500">{tr('Заметка', 'Eslatma')}: </span>{counterparty.note}</div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" size="sm" type="button" onClick={openEdit}>{tr('Изменить', 'Tahrirlash')}</Button>
            <Button variant="danger" size="sm" type="button" onClick={toggleActive} disabled={saving}>
              {counterparty.isActive ? tr('Деактивировать', "O'chirish") : tr('Активировать', 'Faollashtirish')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="sg-pill-row">
        <button type="button" className={`sg-pill ${tab === 'prices' ? 'active' : ''}`} onClick={() => setTab('prices')}>
          {tr('Прайс-лист', "Narxlar ro'yxati")}
        </button>
        <button type="button" className={`sg-pill ${tab === 'ledger' ? 'active' : ''}`} onClick={() => setTab('ledger')}>
          {tr('История долга', 'Qarz tarixi')}
        </button>
        <button type="button" className={`sg-pill ${tab === 'ops' ? 'active' : ''}`} onClick={() => setTab('ops')}>
          {tr('Платёж / Корректировка', "To'lov / Tuzatish")}
        </button>
      </div>

      {tab === 'prices' && (
        <div className="flex flex-col gap-3">
          <Card>
            <p className="m-0 mb-2.5 text-token-sm font-semibold text-neutral-800">{tr('Добавить цену', "Narx qo'shish")}</p>
            <div className="flex gap-2 flex-wrap items-end">
              <div className="min-w-[200px] flex-1">
                <Select
                  label={tr('Товар', 'Mahsulot')}
                  value={priceForm.productId}
                  onChange={(e) => setPriceForm({ productId: e.target.value, variantId: '', price: '' })}
                >
                  <option value="">{tr('Выберите товар', 'Mahsulotni tanlang')}</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              {selectedProduct && Array.isArray(selectedProduct.variants) && selectedProduct.variants.length > 0 && (
                <div className="min-w-[160px]">
                  <Select
                    label={tr('Вариант', 'Variant')}
                    value={priceForm.variantId}
                    onChange={(e) => setPriceForm((prev) => ({ ...prev, variantId: e.target.value }))}
                  >
                    <option value="">{tr('Без варианта', 'Variantsiz')}</option>
                    {selectedProduct.variants.map((v: any) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="w-[140px]">
                <Input
                  label={tr('Цена', 'Narx')}
                  type="number"
                  value={priceForm.price}
                  onChange={(e) => setPriceForm((prev) => ({ ...prev, price: e.target.value }))}
                />
              </div>
              <Button
                variant="primary" size="md" type="button"
                onClick={submitPrice}
                disabled={saving || !priceForm.productId || !priceForm.price}
              >
                {tr('Сохранить', 'Saqlash')}
              </Button>
            </div>
          </Card>

          <Table
            columns={priceColumns}
            data={prices}
            rowKey={(p) => p.id}
            loading={loadingPrices}
            emptyMessage={tr('Индивидуальных цен пока нет — используется розничная цена', "Individual narxlar yo'q — chakana narx ishlatiladi")}
          />
        </div>
      )}

      {tab === 'ledger' && (
        <Table
          columns={ledgerColumns}
          data={ledger}
          rowKey={(l) => l.id}
          loading={loadingLedger}
          emptyMessage={tr('Движений по долгу пока нет', "Hali qarz bo'yicha harakatlar yo'q")}
        />
      )}

      {tab === 'ops' && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="m-0 mb-2.5 text-token-sm font-semibold text-neutral-800">{tr('Записать платёж', "To'lovni qayd etish")}</p>
            <div className="flex flex-col gap-2.5">
              <Input
                label={tr('Сумма', 'Summa')}
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              <Input
                label={tr('Заметка', 'Eslatma')}
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
              />
              <Button
                variant="primary" size="md" type="button"
                onClick={submitPayment}
                disabled={saving || !paymentAmount || Number(paymentAmount) <= 0}
              >
                {tr('Записать платёж', "To'lovni qayd etish")}
              </Button>
            </div>
          </Card>

          <Card>
            <p className="m-0 mb-2.5 text-token-sm font-semibold text-neutral-800">{tr('Корректировка долга', 'Qarzni tuzatish')}</p>
            <div className="flex flex-col gap-2.5">
              <Input
                label={tr('Сумма (+ увеличить, − уменьшить)', 'Summa (+ oshirish, − kamaytirish)')}
                type="number"
                value={adjustmentDelta}
                onChange={(e) => setAdjustmentDelta(e.target.value)}
              />
              <Input
                label={tr('Причина (обязательно)', 'Sabab (majburiy)')}
                value={adjustmentNote}
                onChange={(e) => setAdjustmentNote(e.target.value)}
              />
              <Button
                variant="primary" size="md" type="button"
                onClick={submitAdjustment}
                disabled={saving || !adjustmentDelta || Number(adjustmentDelta) === 0 || !adjustmentNote.trim()}
              >
                {tr('Сохранить корректировку', 'Tuzatishni saqlash')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {editOpen && editForm && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={() => !saving && setEditOpen(false)}>
          <Card className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-3 text-token-base font-semibold text-neutral-800">
              {tr('Изменить контрагента', 'Kontragentni tahrirlash')}
            </h3>
            <div className="flex flex-col gap-3">
              <Input
                label={tr('Название / ФИО', 'Nomi / F.I.Sh.')}
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => prev && ({ ...prev, name: e.target.value }))}
              />
              <Select
                label={tr('Тип', 'Turi')}
                value={editForm.type}
                onChange={(e) => setEditForm((prev) => prev && ({ ...prev, type: e.target.value as CounterpartyType }))}
              >
                {COUNTERPARTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{tr(t.ru, t.uz)}</option>
                ))}
              </Select>
              {editForm.type === 'ORGANIZATION' && (
                <Input
                  label={tr('ИНН', 'STIR')}
                  value={editForm.taxId}
                  onChange={(e) => setEditForm((prev) => prev && ({ ...prev, taxId: e.target.value }))}
                />
              )}
              <Input
                label={tr('Телефон', 'Telefon')}
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => prev && ({ ...prev, phone: e.target.value }))}
              />
              <Input
                label="Email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => prev && ({ ...prev, email: e.target.value }))}
              />
              <Input
                label={tr('Адрес', 'Manzil')}
                value={editForm.address}
                onChange={(e) => setEditForm((prev) => prev && ({ ...prev, address: e.target.value }))}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-token-sm font-medium text-neutral-700">{tr('Заметка', 'Eslatma')}</label>
                <textarea
                  value={editForm.note}
                  onChange={(e) => setEditForm((prev) => prev && ({ ...prev, note: e.target.value }))}
                  rows={3}
                  className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="md" type="button" onClick={() => setEditOpen(false)} disabled={saving}>
                {tr('Отмена', 'Bekor')}
              </Button>
              <Button variant="primary" size="md" type="button" onClick={submitEdit} disabled={saving || !canSaveEdit}>
                {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Сохранить', 'Saqlash')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
