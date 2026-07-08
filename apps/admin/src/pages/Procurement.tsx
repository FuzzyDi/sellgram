import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import type { BadgeVariant } from '../components/Badge';
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
  const [currency, setCurrency] = useState('USD');
  const [fxRate, setFxRate] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [customsCost, setCustomsCost] = useState('0');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([{ productId: '', qty: 1, unitCost: 0 }]);

  // Receive PO modal
  const [receivePo, setReceivePo] = useState<any | null>(null);
  const [receiveItems, setReceiveItems] = useState<Record<string, number>>({});

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

  function resetCreateForm() {
    setSupplier(''); setSupplierId(''); setCurrency('USD'); setFxRate('');
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
    setSaving(true);
    try {
      const resolvedName = supplierId
        ? (suppliers.find((s: any) => s.id === supplierId)?.name ?? supplier.trim())
        : supplier.trim();
      await adminApi.createPurchaseOrder({
        supplierId: supplierId || undefined,
        supplierName: resolvedName,
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
      await adminApi.receivePurchaseOrder(receivePo.id, {
        items: Object.entries(receiveItems).map(([itemId, qtyReceived]) => ({ itemId, qtyReceived })),
      });
      setReceivePo(null);
      await load();
      showNotice('success', tr('Поставка принята, остатки обновлены', 'Yetkazib berish qabul qilindi, qoldiqlar yangilandi'));
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
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Закупки', 'Yetkazib berish')}</h2>
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
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Закупки', 'Yetkazib berish')}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">{tr('Управление поставками и складскими остатками', 'Yetkazib berish va ombor qoldiqlarini boshqarish')}</p>
        </div>
        <Button variant="primary" size="md" type="button" onClick={() => setShowCreate(true)} disabled={showCreate}>
          + {tr('Новый заказ', 'Yangi buyurtma')}
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
          <p className="m-0 text-token-sm text-neutral-500">{tr('Заказов поставщикам пока нет', "Hali yetkazib beruvchi buyurtmalari yo'q")}</p>
        </Card>
      ) : (
        pos.map((po: any) => {
          const status = po.status as POStatus;
          const transitions = PO_TRANSITIONS[status] || [];
          const canReceive = status === 'IN_TRANSIT';

          return (
            <PurchaseOrderCard
              key={po.id}
              po={po}
              transitions={transitions}
              canReceive={canReceive}
              statusLabel={statusLabel}
              statusBadgeVariant={statusBadgeVariant}
              saving={saving}
              onTransition={(poId, next) => void transition(poId, next)}
              onReceive={openReceive}
            />
          );
        })
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
