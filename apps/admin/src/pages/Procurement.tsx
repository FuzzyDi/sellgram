import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge, { type BadgeVariant } from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';
import CreatePurchaseOrderForm from './procurement/CreatePurchaseOrderForm';
import PurchaseOrderCard from './procurement/PurchaseOrderCard';
import ReceivePurchaseOrderModal from './procurement/ReceivePurchaseOrderModal';
import CreateReturnForm from './procurement/CreateReturnForm';
import ReturnCard from './procurement/ReturnCard';
import type { POStatus, ReturnStatus } from './procurement/types';

type NoticeTone = 'success' | 'error';

const PO_TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT:      ['ORDERED', 'CANCELLED'],
  ORDERED:    ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['CANCELLED'],
  RECEIVED:   [],
  CANCELLED:  [],
};

function statusBadgeVariant(status: POStatus): BadgeVariant {
  if (status === 'RECEIVED')   return 'success';
  if (status === 'CANCELLED')  return 'danger';
  if (status === 'ORDERED')    return 'info';
  if (status === 'IN_TRANSIT') return 'warning';
  return 'neutral';
}

const PAYMENT_METHOD_BADGE: Record<string, BadgeVariant> = {
  CASH: 'neutral',
  NON_CASH: 'neutral',
  CREDIT: 'warning',
};

export default function Procurement() {
  const { tr, locale } = useAdminI18n();
  const navigate = useNavigate();
  const [pos, setPos] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [loading, setLoading] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Create PO form
  const [showCreate, setShowCreate] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'NON_CASH' | 'CREDIT'>('CASH');
  const [currency, setCurrency] = useState('USD');
  const [fxRate, setFxRate] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [customsCost, setCustomsCost] = useState('0');
  const [note, setNote] = useState('');
  const [relatesToId, setRelatesToId] = useState('');
  const [items, setItems] = useState([{ productId: '', qty: 1, unitCost: 0 }]);

  // Receive PO modal
  const [receivePo, setReceivePo] = useState<any | null>(null);
  const [receiveItems, setReceiveItems] = useState<Record<string, number>>({});

  // List shows a compact summary row per document; opening one reveals its
  // items/cost breakdown below instead of every document being expanded
  // at once.
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  // Whether the current user can edit a RECEIVED document's note — items/
  // costs stay locked for everyone regardless (see procurement/routes.ts).
  const [canEditReceived, setCanEditReceived] = useState(false);

  const [tab, setTab] = useState<'documents' | 'returns'>('documents');

  // Returns to supplier
  const [returns, setReturns] = useState<any[]>([]);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState('');
  const [returnPurchaseOrderId, setReturnPurchaseOrderId] = useState('');
  const [returnCurrency, setReturnCurrency] = useState('USD');
  const [returnFxRate, setReturnFxRate] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [returnItems, setReturnItems] = useState([{ productId: '', qty: 1, unitCost: 0 }]);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function load() {
    setLoading(true);
    try {
      const [poList, productList, supplierList, returnList] = await Promise.all([
        adminApi.getPurchaseOrders(),
        adminApi.getProducts('pageSize=500'),
        adminApi.getSuppliers().catch(() => []),
        adminApi.getSupplierReturns().catch(() => []),
      ]);
      setPos(Array.isArray(poList?.items ?? poList) ? (poList?.items ?? poList) : []);
      setProducts(Array.isArray(productList?.items ?? productList) ? (productList?.items ?? productList) : []);
      setSuppliers(Array.isArray(supplierList) ? supplierList : []);
      setReturns(Array.isArray(returnList?.items ?? returnList) ? (returnList?.items ?? returnList) : []);
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

  useEffect(() => {
    adminApi.me()
      .then((me: any) => setCanEditReceived(Boolean(me?.effectivePermissions?.editReceivedDocuments)))
      .catch(() => setCanEditReceived(false));
  }, []);

  const statusLabel: Record<POStatus, string> = {
    DRAFT:      tr('Черновик', 'Qoralama'),
    ORDERED:    tr('Заказан', 'Buyurtma berildi'),
    IN_TRANSIT: tr('В пути', "Yo'lda"),
    RECEIVED:   tr('Получен', 'Qabul qilindi'),
    CANCELLED:  tr('Отменён', 'Bekor qilindi'),
  };

  const paymentMethodLabel: Record<string, string> = {
    CASH: tr('Наличные', 'Naqd'),
    NON_CASH: tr('Безналичный', 'Naqd emas'),
    CREDIT: tr('В долг', 'Qarzga'),
  };

  const selectedPo = pos.find((po: any) => po.id === selectedPoId) ?? null;

  const documentColumns: TableColumn<any>[] = [
    {
      key: 'po',
      header: 'PO#',
      render: (po) => (
        <span className="font-semibold text-neutral-800 inline-flex items-center gap-1.5">
          <span className={`transition-transform ${po.id === selectedPoId ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
          PO-{po.poNumber}
        </span>
      ),
    },
    { key: 'supplier', header: tr('Поставщик', 'Yetkazib beruvchi'), render: (po) => po.supplierName },
    {
      key: 'paymentMethod',
      header: tr('Оплата', "To'lov"),
      render: (po) => <Badge variant={PAYMENT_METHOD_BADGE[po.paymentMethod] || 'neutral'}>{paymentMethodLabel[po.paymentMethod] || po.paymentMethod}</Badge>,
    },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (po) => <Badge variant={statusBadgeVariant(po.status)}>{statusLabel[po.status as POStatus] || po.status}</Badge>,
    },
    {
      key: 'total',
      header: tr('Сумма', 'Summa'),
      render: (po) => <span className="font-semibold text-neutral-800">{Number(po.totalCost).toLocaleString(locale)} {po.currency}</span>,
    },
    { key: 'date', header: tr('Дата', 'Sana'), render: (po) => new Date(po.createdAt).toLocaleDateString(locale) },
  ];

  function resetCreateForm() {
    setSupplier(''); setSupplierId(''); setPaymentMethod('CASH'); setCurrency('USD'); setFxRate('');
    setShippingCost('0'); setCustomsCost('0'); setNote(''); setRelatesToId('');
    setItems([{ productId: '', qty: 1, unitCost: 0 }]);
    setShowCreate(false);
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: '', qty: 1, unitCost: 0 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: string, value: string | number) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const createTotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.qty || 0) * (item.unitCost || 0), 0) + Number(shippingCost || 0) + Number(customsCost || 0),
    [items, shippingCost, customsCost]
  );

  async function submitCreate() {
    if ((!supplierId && !supplier.trim()) || items.some((i) => !i.productId || !i.qty || !i.unitCost)) {
      showNotice('error', tr('Заполните все обязательные поля', "Barcha maydonlarni to'ldiring"));
      return;
    }
    if (paymentMethod === 'CREDIT' && !supplierId) {
      showNotice('error', tr('Для покупки в долг выберите контрагента-поставщика из списка', "Qarzga xarid uchun ro'yxatdan yetkazib beruvchini tanlang"));
      return;
    }
    setSaving(true);
    try {
      const resolvedName = supplierId
        ? (suppliers.find((s: any) => s.id === supplierId)?.name ?? supplier.trim())
        : supplier.trim();
      await adminApi.createPurchaseOrder({
        supplierId: supplierId || undefined,
        supplierName: resolvedName,
        paymentMethod,
        currency,
        fxRate: fxRate ? Number(fxRate) : undefined,
        shippingCost: Number(shippingCost || 0),
        customsCost: Number(customsCost || 0),
        note: note.trim() || undefined,
        relatesToId: relatesToId || undefined,
        items: items.map((i) => ({ productId: i.productId, qty: Number(i.qty), unitCost: Number(i.unitCost) })),
      });
      resetCreateForm();
      await load();
      showNotice('success', tr('Заказ создан', 'Buyurtma yaratildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка создания', 'Yaratish xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function transition(poId: string, status: POStatus) {
    setSaving(true);
    try {
      await adminApi.updatePurchaseOrder(poId, { status });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка обновления', 'Yangilash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  function openReceive(po: any) {
    const initial: Record<string, number> = {};
    for (const item of po.items || []) initial[item.id] = item.qty;
    setReceiveItems(initial);
    setReceivePo(po);
  }

  async function submitReceive() {
    if (!receivePo) return;
    setSaving(true);
    try {
      const result = await adminApi.receivePurchaseOrder(receivePo.id, {
        items: Object.entries(receiveItems).map(([itemId, qtyReceived]) => ({ itemId, qtyReceived })),
      });
      setReceivePo(null);
      await load();
      const debtCharged = Number(result?.debtCharged ?? 0);
      showNotice(
        'success',
        debtCharged > 0
          ? tr(`Поставка принята, остатки обновлены. Долг поставщику: +${debtCharged.toLocaleString(locale)}`, `Yetkazib berish qabul qilindi. Yetkazib beruvchi qarzi: +${debtCharged.toLocaleString(locale)}`)
          : tr('Поставка принята, остатки обновлены', 'Yetkazib berish qabul qilindi, qoldiqlar yangilandi')
      );
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка приёмки', 'Qabul qilish xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function addPoItem(poId: string, data: { productId: string; qty: number; unitCost: number }) {
    setSaving(true);
    try {
      await adminApi.addPurchaseOrderItem(poId, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function updatePoItem(poId: string, itemId: string, data: { qty?: number; unitCost?: number }) {
    setSaving(true);
    try {
      await adminApi.updatePurchaseOrderItem(poId, itemId, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removePoItem(poId: string, itemId: string) {
    setSaving(true);
    try {
      await adminApi.deletePurchaseOrderItem(poId, itemId);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function savePoNote(poId: string, noteValue: string) {
    setSaving(true);
    try {
      await adminApi.updatePurchaseOrder(poId, { note: noteValue });
      await load();
      showNotice('success', tr('Заметка сохранена', 'Eslatma saqlandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  // ─── Returns to supplier ──────────────────────────────────────────────

  const returnStatusLabel: Record<ReturnStatus, string> = {
    DRAFT: tr('Черновик', 'Qoralama'),
    CONFIRMED: tr('Подтверждён', 'Tasdiqlangan'),
    CANCELLED: tr('Отменён', 'Bekor qilindi'),
  };

  function returnStatusBadgeVariant(status: ReturnStatus): BadgeVariant {
    if (status === 'CONFIRMED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    return 'neutral';
  }

  const selectedReturn = returns.find((r: any) => r.id === selectedReturnId) ?? null;

  const returnColumns: TableColumn<any>[] = [
    {
      key: 'ret',
      header: 'RET#',
      render: (r) => (
        <span className="font-semibold text-neutral-800 inline-flex items-center gap-1.5">
          <span className={`transition-transform ${r.id === selectedReturnId ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
          RET-{r.returnNumber}
        </span>
      ),
    },
    { key: 'supplier', header: tr('Поставщик', 'Yetkazib beruvchi'), render: (r) => r.supplier?.name || r.supplierId },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (r) => <Badge variant={returnStatusBadgeVariant(r.status)}>{returnStatusLabel[r.status as ReturnStatus] || r.status}</Badge>,
    },
    {
      key: 'total',
      header: tr('Сумма', 'Summa'),
      render: (r) => <span className="font-semibold text-neutral-800">{Number(r.totalCost).toLocaleString(locale)} {r.currency}</span>,
    },
    { key: 'date', header: tr('Дата', 'Sana'), render: (r) => new Date(r.createdAt).toLocaleDateString(locale) },
  ];

  function resetCreateReturnForm() {
    setReturnSupplierId(''); setReturnPurchaseOrderId(''); setReturnCurrency('USD'); setReturnFxRate(''); setReturnNote('');
    setReturnItems([{ productId: '', qty: 1, unitCost: 0 }]);
    setShowCreateReturn(false);
  }

  function addReturnItem() {
    setReturnItems((prev) => [...prev, { productId: '', qty: 1, unitCost: 0 }]);
  }

  function removeReturnItem(idx: number) {
    setReturnItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateReturnItem(idx: number, field: string, value: string | number) {
    setReturnItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const returnCreateTotal = useMemo(
    () => returnItems.reduce((sum, item) => sum + (item.qty || 0) * (item.unitCost || 0), 0),
    [returnItems]
  );

  async function submitCreateReturn() {
    if (!returnSupplierId || returnItems.some((i) => !i.productId || !i.qty || !i.unitCost)) {
      showNotice('error', tr('Заполните все обязательные поля', "Barcha maydonlarni to'ldiring"));
      return;
    }
    setSaving(true);
    try {
      await adminApi.createSupplierReturn({
        supplierId: returnSupplierId,
        purchaseOrderId: returnPurchaseOrderId || undefined,
        currency: returnCurrency,
        fxRate: returnFxRate ? Number(returnFxRate) : undefined,
        note: returnNote.trim() || undefined,
        items: returnItems.map((i) => ({ productId: i.productId, qty: Number(i.qty), unitCost: Number(i.unitCost) })),
      });
      resetCreateReturnForm();
      await load();
      showNotice('success', tr('Возврат создан', 'Qaytarish yaratildi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка создания', 'Yaratish xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelReturn(id: string) {
    setSaving(true);
    try {
      await adminApi.updateSupplierReturn(id, { status: 'CANCELLED' });
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmReturn(id: string) {
    setSaving(true);
    try {
      await adminApi.confirmSupplierReturn(id);
      await load();
      showNotice('success', tr('Возврат подтверждён, остатки и долг обновлены', 'Qaytarish tasdiqlandi, qoldiq va qarz yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка подтверждения', 'Tasdiqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function addReturnItemToServer(returnId: string, data: { productId: string; qty: number; unitCost: number }) {
    setSaving(true);
    try {
      await adminApi.addSupplierReturnItem(returnId, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function updateReturnItemOnServer(returnId: string, itemId: string, data: { qty?: number; unitCost?: number }) {
    setSaving(true);
    try {
      await adminApi.updateSupplierReturnItem(returnId, itemId, data);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
    }
  }

  async function removeReturnItemOnServer(returnId: string, itemId: string) {
    setSaving(true);
    try {
      await adminApi.deleteSupplierReturnItem(returnId, itemId);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xato'));
    } finally {
      setSaving(false);
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

  if (planBlocked) {
    return (
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Приходные документы', 'Kirim hujjatlari')}</h2>
        </header>
        <Card className="text-center py-8 px-4">
          <div className="text-token-2xl mb-3">🔒</div>
          <p className="m-0 font-semibold text-token-lg text-neutral-800">{tr('Доступно на PRO и BUSINESS', 'PRO va BUSINESS tariflarida mavjud')}</p>
          <p className="mt-1.5 text-token-sm text-neutral-500">{tr('Управление поставщиками и складскими остатками', 'Yetkazib beruvchilar va ombor qoldiqlarini boshqarish')}</p>
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
          <div className="h-7 w-[30%] rounded-token-sm bg-neutral-100 animate-pulse" />
          <div className="h-3.5 w-1/2 rounded-token-sm bg-neutral-100 animate-pulse mt-2" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <div className="h-5 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse mb-2" />
            <div className="h-3.5 w-[70%] rounded-token-sm bg-neutral-100 animate-pulse" />
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
          <h2 className="text-token-2xl font-semibold text-neutral-800">
            {tab === 'documents' ? tr('Приходные документы', 'Kirim hujjatlari') : tr('Возвраты поставщику', "Ta'minotchiga qaytarishlar")}
          </h2>
          <p className="mt-1 text-token-sm text-neutral-500">
            {tab === 'documents'
              ? tr('Документы от поставщиков: товары, количество, закупочные цены и способ оплаты', "Yetkazib beruvchilardan hujjatlar: mahsulotlar, miqdor, sotib olish narxi va to'lov usuli")
              : tr('Товары, отправленные обратно поставщику: остатки и долг уменьшаются', "Ta'minotchiga qaytarilgan tovarlar: qoldiq va qarz kamayadi")}
          </p>
        </div>
        {tab === 'documents' ? (
          <Button variant="primary" size="md" type="button" onClick={() => setShowCreate(true)} disabled={showCreate}>
            + {tr('Новый документ', 'Yangi hujjat')}
          </Button>
        ) : (
          <Button variant="primary" size="md" type="button" onClick={() => setShowCreateReturn(true)} disabled={showCreateReturn}>
            + {tr('Новый возврат', 'Yangi qaytarish')}
          </Button>
        )}
      </header>

      <div className="flex gap-1">
        <Button type="button" variant={tab === 'documents' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('documents')}>
          {tr('Приходные документы', 'Kirim hujjatlari')}
        </Button>
        <Button type="button" variant={tab === 'returns' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('returns')}>
          {tr('Возвраты поставщику', "Ta'minotchiga qaytarishlar")}
        </Button>
      </div>

      {tab === 'documents' ? (
        <>
          {showCreate && (
            <CreatePurchaseOrderForm
              suppliers={suppliers}
              products={products}
              existingDocs={pos}
              supplierId={supplierId}
              setSupplierId={setSupplierId}
              supplier={supplier}
              setSupplier={setSupplier}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              relatesToId={relatesToId}
              setRelatesToId={setRelatesToId}
              currency={currency}
              setCurrency={setCurrency}
              fxRate={fxRate}
              setFxRate={setFxRate}
              shippingCost={shippingCost}
              setShippingCost={setShippingCost}
              customsCost={customsCost}
              setCustomsCost={setCustomsCost}
              note={note}
              setNote={setNote}
              items={items}
              addItem={addItem}
              removeItem={removeItem}
              updateItem={updateItem}
              createTotal={createTotal}
              saving={saving}
              onSubmit={() => void submitCreate()}
              onCancel={resetCreateForm}
            />
          )}

          {pos.length === 0 && !showCreate ? (
            <Card className="text-center py-10 px-4">
              <p className="m-0 text-token-sm text-neutral-500">{tr('Приходных документов пока нет', "Hali kirim hujjatlari yo'q")}</p>
            </Card>
          ) : (
            <Table
              columns={documentColumns}
              data={pos}
              rowKey={(po) => po.id}
              onRowClick={(po) => setSelectedPoId((prev) => (prev === po.id ? null : po.id))}
            />
          )}

          {selectedPo && (() => {
            const status = selectedPo.status as POStatus;
            const transitions = PO_TRANSITIONS[status] || [];
            const canReceive = status === 'IN_TRANSIT';
            return (
              <PurchaseOrderCard
                key={selectedPo.id}
                po={selectedPo}
                transitions={transitions}
                canReceive={canReceive}
                statusLabel={statusLabel}
                statusBadgeVariant={statusBadgeVariant}
                saving={saving}
                onTransition={(poId, next) => void transition(poId, next)}
                onReceive={openReceive}
                products={products}
                canEditItems={status === 'DRAFT' || status === 'ORDERED' || status === 'IN_TRANSIT'}
                onAddItem={(data) => void addPoItem(selectedPo.id, data)}
                onUpdateItem={(itemId, data) => void updatePoItem(selectedPo.id, itemId, data)}
                onRemoveItem={(itemId) => void removePoItem(selectedPo.id, itemId)}
                canEditReceivedNote={canEditReceived}
                onSaveNote={(noteValue) => void savePoNote(selectedPo.id, noteValue)}
              />
            );
          })()}
        </>
      ) : (
        <>
          {showCreateReturn && (
            <CreateReturnForm
              suppliers={suppliers}
              products={products}
              purchaseOrders={pos}
              supplierId={returnSupplierId}
              setSupplierId={setReturnSupplierId}
              purchaseOrderId={returnPurchaseOrderId}
              setPurchaseOrderId={setReturnPurchaseOrderId}
              currency={returnCurrency}
              setCurrency={setReturnCurrency}
              fxRate={returnFxRate}
              setFxRate={setReturnFxRate}
              note={returnNote}
              setNote={setReturnNote}
              items={returnItems}
              addItem={addReturnItem}
              removeItem={removeReturnItem}
              updateItem={updateReturnItem}
              createTotal={returnCreateTotal}
              saving={saving}
              onSubmit={() => void submitCreateReturn()}
              onCancel={resetCreateReturnForm}
            />
          )}

          {returns.length === 0 && !showCreateReturn ? (
            <Card className="text-center py-10 px-4">
              <p className="m-0 text-token-sm text-neutral-500">{tr('Возвратов пока нет', "Hali qaytarishlar yo'q")}</p>
            </Card>
          ) : (
            <Table
              columns={returnColumns}
              data={returns}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelectedReturnId((prev) => (prev === r.id ? null : r.id))}
            />
          )}

          {selectedReturn && (
            <ReturnCard
              key={selectedReturn.id}
              ret={selectedReturn}
              saving={saving}
              onCancel={cancelReturn}
              onConfirm={confirmReturn}
              products={products}
              canEditItems={selectedReturn.status === 'DRAFT'}
              onAddItem={(data) => void addReturnItemToServer(selectedReturn.id, data)}
              onUpdateItem={(itemId, data) => void updateReturnItemOnServer(selectedReturn.id, itemId, data)}
              onRemoveItem={(itemId) => void removeReturnItemOnServer(selectedReturn.id, itemId)}
            />
          )}
        </>
      )}

      {receivePo && (
        <ReceivePurchaseOrderModal
          po={receivePo}
          receiveItems={receiveItems}
          setReceiveItems={setReceiveItems}
          saving={saving}
          onClose={() => setReceivePo(null)}
          onSubmit={() => void submitReceive()}
        />
      )}
    </section>
  );
}
