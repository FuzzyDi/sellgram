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
import type { POStatus } from './procurement/types';

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
  const [items, setItems] = useState([{ productId: '', qty: 1, unitCost: 0 }]);

  // Receive PO modal
  const [receivePo, setReceivePo] = useState<any | null>(null);
  const [receiveItems, setReceiveItems] = useState<Record<string, number>>({});

  // List shows a compact summary row per document; opening one reveals its
  // items/cost breakdown below instead of every document being expanded
  // at once.
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function load() {
    setLoading(true);
    try {
      const [poList, productList, supplierList] = await Promise.all([
        adminApi.getPurchaseOrders(),
        adminApi.getProducts('pageSize=500'),
        adminApi.getSuppliers().catch(() => []),
      ]);
      setPos(Array.isArray(poList?.items ?? poList) ? (poList?.items ?? poList) : []);
      setProducts(Array.isArray(productList?.items ?? productList) ? (productList?.items ?? productList) : []);
      setSuppliers(Array.isArray(supplierList) ? supplierList : []);
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
    setShippingCost('0'); setCustomsCost('0'); setNote('');
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
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Приходные документы', 'Kirim hujjatlari')}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">{tr('Документы от поставщиков: товары, количество, закупочные цены и способ оплаты', "Yetkazib beruvchilardan hujjatlar: mahsulotlar, miqdor, sotib olish narxi va to'lov usuli")}</p>
        </div>
        <Button variant="primary" size="md" type="button" onClick={() => setShowCreate(true)} disabled={showCreate}>
          + {tr('Новый документ', 'Yangi hujjat')}
        </Button>
      </header>

      {showCreate && (
        <CreatePurchaseOrderForm
          suppliers={suppliers}
          products={products}
          supplierId={supplierId}
          setSupplierId={setSupplierId}
          supplier={supplier}
          setSupplier={setSupplier}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
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
            po={selectedPo}
            transitions={transitions}
            canReceive={canReceive}
            statusLabel={statusLabel}
            statusBadgeVariant={statusBadgeVariant}
            saving={saving}
            onTransition={(poId, next) => void transition(poId, next)}
            onReceive={openReceive}
          />
        );
      })()}

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
