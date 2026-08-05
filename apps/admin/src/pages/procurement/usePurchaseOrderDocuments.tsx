import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Badge, { type BadgeVariant } from '../../components/Badge';
import type { TableColumn } from '../../components/Table';
import type { POStatus } from './types';

export const PO_TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT:      ['ORDERED', 'CANCELLED'],
  ORDERED:    ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['CANCELLED'],
  RECEIVED:   [],
  CANCELLED:  [],
};

export function statusBadgeVariant(status: POStatus): BadgeVariant {
  if (status === 'RECEIVED')   return 'success';
  if (status === 'CANCELLED')  return 'danger';
  if (status === 'ORDERED')    return 'info';
  if (status === 'IN_TRANSIT') return 'warning';
  return 'neutral';
}

export const PAYMENT_METHOD_BADGE: Record<string, BadgeVariant> = {
  CASH: 'neutral',
  NON_CASH: 'neutral',
  CREDIT: 'warning',
  CONSIGNMENT: 'info',
};

interface UsePurchaseOrderDocumentsParams {
  pos: any[];
  suppliers: any[];
  saving: boolean;
  setSaving: (value: boolean) => void;
  showNotice: (tone: 'success' | 'error', message: string) => void;
  load: () => Promise<void>;
}

// The "Приходные" tab — purchase orders. Also owns the RECEIVED-document
// note-edit permission check (editReceivedDocuments), since only this
// tab's card (PurchaseOrderCard) ever needs it.
export function usePurchaseOrderDocuments({ pos, suppliers, saving, setSaving, showNotice, load }: UsePurchaseOrderDocumentsParams) {
  const { tr, locale } = useAdminI18n();

  const [showCreate, setShowCreate] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'NON_CASH' | 'CREDIT' | 'CONSIGNMENT'>('CASH');
  const [currency, setCurrency] = useState('USD');
  const [fxRate, setFxRate] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [customsCost, setCustomsCost] = useState('0');
  const [note, setNote] = useState('');
  const [relatesToId, setRelatesToId] = useState('');
  const [items, setItems] = useState([{ productId: '', qty: 1, unitCost: 0 }]);

  const [receivePo, setReceivePo] = useState<any | null>(null);
  const [receiveItems, setReceiveItems] = useState<Record<string, number>>({});

  // List shows a compact summary row per document; opening one reveals its
  // items/cost breakdown below instead of every document being expanded
  // at once.
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  // Whether the current user can edit a RECEIVED document's note — items/
  // costs stay locked for everyone regardless (see procurement/routes.ts).
  const [canEditReceived, setCanEditReceived] = useState(false);

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
    CONSIGNMENT: tr('Под реализацию', 'Realizatsiyaga'),
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
    if ((paymentMethod === 'CREDIT' || paymentMethod === 'CONSIGNMENT') && !supplierId) {
      showNotice('error', tr('Для покупки в долг или под реализацию выберите контрагента-поставщика из списка', "Qarzga yoki realizatsiyaga xarid uchun ro'yxatdan yetkazib beruvchini tanlang"));
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

  return {
    showCreate, setShowCreate,
    supplier, setSupplier, supplierId, setSupplierId,
    paymentMethod, setPaymentMethod,
    currency, setCurrency, fxRate, setFxRate,
    shippingCost, setShippingCost, customsCost, setCustomsCost,
    note, setNote, relatesToId, setRelatesToId,
    items, addItem, removeItem, updateItem, createTotal,
    receivePo, setReceivePo, receiveItems, setReceiveItems, openReceive, submitReceive,
    selectedPoId, setSelectedPoId, selectedPo,
    canEditReceived,
    statusLabel, paymentMethodLabel, documentColumns,
    resetCreateForm, submitCreate, transition,
    addPoItem, updatePoItem, removePoItem, savePoNote,
  };
}
