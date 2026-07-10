import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge, { type BadgeVariant } from '../../components/Badge';
import Table, { type TableColumn } from '../../components/Table';
import {
  useB2bStores, useB2bEnabled, B2bNotEnabled, B2bSubNav, B2bHeader,
} from './b2b-shared';

type NoticeTone = 'success' | 'error';

const STATUS_BADGE: Record<string, BadgeVariant> = {
  NEW: 'info',
  CONFIRMED: 'info',
  PREPARING: 'warning',
  READY: 'warning',
  SHIPPED: 'warning',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'danger',
};

interface OrderItemForm {
  productId: string;
  variantId: string;
  qty: string;
}

function emptyItem(): OrderItemForm {
  return { productId: '', variantId: '', qty: '1' };
}

export default function B2bOrders() {
  const { tr, locale } = useAdminI18n();
  const { enabled, checking, recheck } = useB2bEnabled();
  const { stores, storeId, selectStore, loading: storesLoading } = useB2bStores();

  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const statusLabels: Record<string, string> = {
    NEW: tr('Новый', 'Yangi'),
    CONFIRMED: tr('Подтвержден', 'Tasdiqlandi'),
    PREPARING: tr('Готовится', 'Tayyorlanmoqda'),
    READY: tr('Готов', 'Tayyor'),
    SHIPPED: tr('В пути', "Yo'lda"),
    DELIVERED: tr('Доставлен', 'Yetkazildi'),
    COMPLETED: tr('Завершен', 'Yakunlandi'),
    CANCELLED: tr('Отменен', 'Bekor qilindi'),
    REFUNDED: tr('Возврат', 'Qaytarildi'),
  };

  const [formOpen, setFormOpen] = useState(false);
  const [orderCounterpartyId, setOrderCounterpartyId] = useState('');
  const [paymentTermDays, setPaymentTermDays] = useState('30');
  const [orderNote, setOrderNote] = useState('');
  const [items, setItems] = useState<OrderItemForm[]>([emptyItem()]);
  const [resolvedPrices, setResolvedPrices] = useState<Record<string, number>>({});

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  async function loadOrders() {
    setLoadingOrders(true);
    try {
      const data = await adminApi.getOrders('salesChannel=B2B&pageSize=100');
      setOrders(Array.isArray(data?.items) ? data.items : []);
    } catch (err: any) {
      showNotice('error', err?.message || tr('Не удалось загрузить заказы', "Buyurtmalarni yuklab bo'lmadi"));
    } finally {
      setLoadingOrders(false);
    }
  }

  async function loadCounterparties() {
    try {
      const data = await adminApi.getCounterparties('pageSize=200&isActive=true');
      setCounterparties(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setCounterparties([]);
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
    if (enabled) {
      void loadOrders();
      void loadCounterparties();
      void loadProducts();
    }
  }, [enabled]);

  function resetForm() {
    setOrderCounterpartyId('');
    setPaymentTermDays('30');
    setOrderNote('');
    setItems([emptyItem()]);
    setResolvedPrices({});
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof OrderItemForm, value: string) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, [field]: value };
      if (field === 'productId') next.variantId = '';
      return next;
    }));
  }

  // Price preview per line: counterparty's negotiated price if one exists
  // for this (productId, variantId) pair, else the variant's own price,
  // else the product's retail price — same fallback order as
  // order.service.ts's createB2BOrder() §4 resolution, just previewed
  // client-side before the order is actually submitted.
  useEffect(() => {
    let cancelled = false;
    async function resolvePrices() {
      if (!orderCounterpartyId) {
        setResolvedPrices({});
        return;
      }
      try {
        const cpPrices = await adminApi.getCounterpartyPrices(orderCounterpartyId);
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const cp of Array.isArray(cpPrices) ? cpPrices : []) {
          map[`${cp.productId}:${cp.variantId ?? ''}`] = Number(cp.price);
        }
        setResolvedPrices(map);
      } catch {
        if (!cancelled) setResolvedPrices({});
      }
    }
    void resolvePrices();
    return () => { cancelled = true; };
  }, [orderCounterpartyId]);

  function priceForLine(item: OrderItemForm): number | null {
    const product = products.find((p: any) => p.id === item.productId);
    if (!product) return null;
    const variantId = item.variantId || null;
    const cpPrice = resolvedPrices[`${item.productId}:${variantId ?? ''}`];
    if (cpPrice !== undefined) return cpPrice;
    const variant = variantId ? (product.variants || []).find((v: any) => v.id === variantId) : null;
    if (variant?.price != null) return Number(variant.price);
    return Number(product.price);
  }

  const createTotal = useMemo(
    () => items.reduce((sum, item) => {
      const price = priceForLine(item);
      const qty = Number(item.qty) || 0;
      return sum + (price ?? 0) * qty;
    }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, resolvedPrices, products]
  );

  const canSubmitOrder = useMemo(() => {
    if (!orderCounterpartyId || !storeId) return false;
    if (items.length === 0) return false;
    return items.every((i) => i.productId && Number(i.qty) > 0);
  }, [orderCounterpartyId, storeId, items]);

  async function submitOrder() {
    if (!canSubmitOrder) return;
    setSaving(true);
    try {
      await adminApi.createB2bOrder(orderCounterpartyId, {
        storeId,
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId || null,
          qty: Number(i.qty),
        })),
        paymentTermDays: paymentTermDays ? Number(paymentTermDays) : undefined,
        note: orderNote.trim() || undefined,
      });
      setFormOpen(false);
      showNotice('success', tr('Заказ создан', 'Buyurtma yaratildi'));
      await loadOrders();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка создания заказа', 'Buyurtma yaratishda xato'));
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumn<any>[] = [
    { key: 'number', header: '№', render: (o) => <span className="font-semibold text-neutral-800">#{o.orderNumber}</span> },
    { key: 'counterparty', header: tr('Контрагент', 'Kontragent'), render: (o) => o.counterparty?.name || '—' },
    { key: 'total', header: tr('Сумма', 'Summa'), render: (o) => Number(o.total).toLocaleString(locale) },
    { key: 'date', header: tr('Дата', 'Sana'), render: (o) => new Date(o.createdAt).toLocaleString(locale) },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (o) => <Badge variant={STATUS_BADGE[o.status] || 'neutral'}>{statusLabels[o.status] || o.status}</Badge>,
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

  if (checking) {
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
      <B2bHeader tr={tr} title={tr('Заказы', 'Buyurtmalar')} subtitle={tr('Оптовые заказы контрагентов', 'Kontragentlarning optom buyurtmalari')} />
      <B2bSubNav />

      {!enabled ? (
        <B2bNotEnabled onEnabled={recheck} />
      ) : (
        <>
          {!storesLoading && stores.length > 0 && (
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="w-full max-w-[280px]">
                <Select label={tr('Склад для нового заказа', 'Yangi buyurtma uchun ombor')} value={storeId} onChange={(e) => selectStore(e.target.value)}>
                  {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              <Button variant="primary" size="md" type="button" onClick={openCreate}>
                + {tr('Создать B2B заказ', 'B2B buyurtma yaratish')}
              </Button>
            </div>
          )}

          <Table
            columns={columns}
            data={orders}
            rowKey={(o) => o.id}
            loading={loadingOrders}
            emptyMessage={tr('B2B заказов пока нет', "Hali B2B buyurtmalar yo'q")}
          />
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={() => !saving && setFormOpen(false)}>
          <Card className="w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-3 text-token-base font-semibold text-neutral-800">
              {tr('Новый B2B заказ', 'Yangi B2B buyurtma')}
            </h3>
            <div className="flex flex-col gap-3">
              <Select
                label={tr('Контрагент', 'Kontragent')}
                value={orderCounterpartyId}
                onChange={(e) => setOrderCounterpartyId(e.target.value)}
              >
                <option value="">{tr('Выберите контрагента', 'Kontragentni tanlang')}</option>
                {counterparties.map((cp: any) => (
                  <option key={cp.id} value={cp.id}>{cp.name}</option>
                ))}
              </Select>

              <div>
                <p className="text-token-sm font-medium text-neutral-700 mb-1.5">{tr('Позиции заказа', 'Buyurtma pozitsiyalari')}</p>
                <div className="flex flex-col gap-2">
                  {items.map((item, idx) => {
                    const product = products.find((p: any) => p.id === item.productId);
                    const price = priceForLine(item);
                    return (
                      <div key={idx} className="flex gap-2 items-end flex-wrap border border-neutral-200 rounded-token-md p-2.5">
                        <div className="min-w-[200px] flex-1">
                          <Select
                            label={tr('Товар', 'Mahsulot')}
                            value={item.productId}
                            onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                          >
                            <option value="">{tr('Выберите товар', 'Mahsulotni tanlang')}</option>
                            {products.map((p: any) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </Select>
                        </div>
                        {product && Array.isArray(product.variants) && product.variants.length > 0 && (
                          <div className="min-w-[140px]">
                            <Select
                              label={tr('Вариант', 'Variant')}
                              value={item.variantId}
                              onChange={(e) => updateItem(idx, 'variantId', e.target.value)}
                            >
                              <option value="">{tr('Без варианта', 'Variantsiz')}</option>
                              {product.variants.map((v: any) => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                              ))}
                            </Select>
                          </div>
                        )}
                        <div className="w-[90px]">
                          <Input
                            label={tr('Кол-во', 'Soni')}
                            type="number"
                            min={1}
                            value={item.qty}
                            onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                          />
                        </div>
                        <div className="text-token-sm text-neutral-600 pb-2 min-w-[110px]">
                          {price != null
                            ? `${price.toLocaleString(locale)} ${resolvedPrices[`${item.productId}:${item.variantId || ''}`] !== undefined ? tr('(цена контрагента)', '(kontragent narxi)') : tr('(розница)', '(chakana)')}`
                            : '—'}
                        </div>
                        <Button variant="danger" size="sm" type="button" onClick={() => removeItem(idx)} disabled={items.length <= 1}>
                          {tr('Убрать', "O'chirish")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" type="button" className="mt-2" onClick={addItem}>
                  + {tr('Добавить позицию', "Pozitsiya qo'shish")}
                </Button>
              </div>

              <Input
                label={tr('Срок оплаты, дней', "To'lov muddati, kun")}
                type="number"
                min={1}
                value={paymentTermDays}
                onChange={(e) => setPaymentTermDays(e.target.value)}
              />
              <Input
                label={tr('Заметка', 'Eslatma')}
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
              />

              <p className="text-token-sm font-semibold text-neutral-800">
                {tr('Итого', 'Jami')}: {createTotal.toLocaleString(locale)}
              </p>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="md" type="button" onClick={() => setFormOpen(false)} disabled={saving}>
                {tr('Отмена', 'Bekor')}
              </Button>
              <Button variant="primary" size="md" type="button" onClick={submitOrder} disabled={saving || !canSubmitOrder}>
                {saving ? tr('Создание...', 'Yaratilmoqda...') : tr('Создать заказ', 'Buyurtma yaratish')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
