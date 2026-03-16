import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type POStatus = 'DRAFT' | 'ORDERED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
type NoticeTone = 'success' | 'error';

const PO_TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT:      ['ORDERED', 'CANCELLED'],
  ORDERED:    ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['CANCELLED'],
  RECEIVED:   [],
  CANCELLED:  [],
};

function statusStyle(status: POStatus): React.CSSProperties {
  if (status === 'RECEIVED')   return { background: '#d1fae5', color: '#065f46' };
  if (status === 'CANCELLED')  return { background: '#fee2e2', color: '#991b1b' };
  if (status === 'ORDERED')    return { background: '#dbeafe', color: '#1e40af' };
  if (status === 'IN_TRANSIT') return { background: '#fef9c3', color: '#854d0e' };
  return { background: '#f3f4f6', color: '#4b5563' };
}

export default function Procurement() {
  const { tr, locale } = useAdminI18n();
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
    IN_TRANSIT: tr('В пути', 'Yo\'lda'),
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
      showNotice('error', tr('Заполните все обязательные поля', 'Barcha maydonlarni to\'ldiring'));
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
    <div style={{
      position: 'fixed', top: 18, right: 18, zIndex: 70, minWidth: 280, maxWidth: 440,
      borderRadius: 12, padding: '12px 14px', fontSize: 14, fontWeight: 700,
      boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
      color: notice.tone === 'error' ? '#991b1b' : '#065f46',
      background: notice.tone === 'error' ? '#fee2e2' : '#d1fae5',
      border: `1px solid ${notice.tone === 'error' ? '#fecaca' : '#a7f3d0'}`,
    }} role="status" aria-live="polite">
      {notice.message}
    </div>
  ) : null;

  if (planBlocked) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <header>
          <h2 className="sg-title">{tr('Закупки', 'Yetkazib berish')}</h2>
        </header>
        <div className="sg-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{tr('Доступно на PRO и BUSINESS', 'PRO va BUSINESS tariflarida mavjud')}</p>
          <p className="sg-subtitle" style={{ marginTop: 6 }}>{tr('Управление поставщиками и складскими остатками', 'Yetkazib beruvchilar va ombor qoldiqlarini boshqarish')}</p>
          <button className="sg-btn primary" style={{ marginTop: 16 }} onClick={() => (window.location.hash = '/billing')}>
            {tr('Обновить тариф', 'Tarifni yangilash')}
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div>
          <div className="sg-skeleton" style={{ height: 28, width: '30%' }} />
          <div className="sg-skeleton" style={{ height: 14, width: '50%', marginTop: 8 }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="sg-card" style={{ padding: 14 }}>
            <div className="sg-skeleton" style={{ height: 18, width: '40%', marginBottom: 8 }} />
            <div className="sg-skeleton" style={{ height: 14, width: '70%' }} />
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sg-title">{tr('Закупки', 'Yetkazib berish')}</h2>
          <p className="sg-subtitle">{tr('Управление поставками и складскими остатками', 'Yetkazib berish va ombor qoldiqlarini boshqarish')}</p>
        </div>
        <button className="sg-btn primary" onClick={() => setShowCreate(true)} disabled={showCreate}>
          + {tr('Новый заказ', 'Yangi buyurtma')}
        </button>
      </header>

      {showCreate && (
        <article className="sg-card sg-grid" style={{ gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{tr('Новый заказ поставщику', 'Yangi yetkazib beruvchi buyurtmasi')}</h3>

          <div className="sg-grid cols-2" style={{ gap: 10 }}>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Поставщик *', 'Yetkazib beruvchi *')}</label>
              {suppliers.length > 0 ? (
                <>
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                    style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px', marginBottom: supplierId ? 0 : 6 }}>
                    <option value="">{tr('— выберите контрагента —', '— kontragentni tanlang —')}</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {!supplierId && (
                    <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full"
                      style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px' }}
                      placeholder={tr('Или введите название вручную', 'Yoki nomni qo\'lda kiriting')} />
                  )}
                </>
              ) : (
                <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full"
                  style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px' }}
                  placeholder={tr('Название компании', 'Kompaniya nomi')} />
              )}
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Валюта', 'Valyuta')}</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px' }}>
                {['USD', 'EUR', 'CNY', 'UZS', 'RUB'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Курс к UZS', 'UZS kursi')}</label>
              <input type="number" value={fxRate} onChange={(e) => setFxRate(e.target.value)} className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px' }} placeholder="12500" />
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Доставка (UZS)', 'Yetkazib berish (UZS)')}</label>
              <input type="number" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px' }} />
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Таможня (UZS)', 'Bojxona (UZS)')}</label>
              <input type="number" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px' }} />
            </div>
            <div>
              <label className="sg-kpi-label" style={{ display: 'block', marginBottom: 4 }}>{tr('Заметка', 'Izoh')}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full"
                style={{ border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 11px' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="sg-kpi-label">{tr('Товары *', 'Mahsulotlar *')}</label>
              <button className="sg-btn ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={addItem}>
                + {tr('Добавить товар', 'Mahsulot qo\'shish')}
              </button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <select value={item.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                  style={{ flex: 3, border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 10px', fontSize: 13 }}>
                  <option value="">{tr('— выберите товар —', '— mahsulot tanlang —')}</option>
                  {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" value={item.qty} min={1}
                  onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))}
                  style={{ flex: 1, border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 8px', fontSize: 13 }}
                  placeholder={tr('Кол-во', 'Soni')} />
                <input type="number" value={item.unitCost} min={0}
                  onChange={(e) => updateItem(idx, 'unitCost', Number(e.target.value))}
                  style={{ flex: 1, border: '1px solid #d6e0da', borderRadius: 10, padding: '8px 8px', fontSize: 13 }}
                  placeholder={tr('Цена', 'Narx')} />
                {items.length > 1 && (
                  <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
                )}
              </div>
            ))}
            <p style={{ fontSize: 12, color: '#748278', marginTop: 4 }}>
              {tr('Итого (без доп. расходов)', 'Jami (qo\'shimcha xarajatlarsiz)')}: <strong>{createTotal.toLocaleString(locale)}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="sg-btn ghost" onClick={resetCreateForm} disabled={saving}>{tr('Отмена', 'Bekor')}</button>
            <button className="sg-btn primary" onClick={submitCreate} disabled={saving}>
              {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Создать заказ', 'Buyurtma yaratish')}
            </button>
          </div>
        </article>
      )}

      {pos.length === 0 && !showCreate ? (
        <div className="sg-card" style={{ textAlign: 'center', padding: '40px 16px' }}>
          <p className="sg-subtitle">{tr('Заказов поставщикам пока нет', 'Hali yetkazib beruvchi buyurtmalari yo\'q')}</p>
        </div>
      ) : (
        pos.map((po: any) => {
          const status = po.status as POStatus;
          const transitions = PO_TRANSITIONS[status] || [];
          const canReceive = status === 'IN_TRANSIT';

          return (
            <article key={po.id} className="sg-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>PO-{po.poNumber}</span>
                    <span className="sg-badge" style={statusStyle(status)}>{statusLabel[status] || status}</span>
                    <span style={{ fontSize: 12, color: '#748278' }}>{new Date(po.createdAt).toLocaleDateString(locale)}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5f6d64' }}>
                    {po.supplierName} · {po.currency}
                    {po.fxRate ? ` · ${po.fxRate} UZS/${po.currency}` : ''}
                    {po.note ? ` · ${po.note}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {transitions.map((next) => (
                    <button key={next} className="sg-btn ghost" style={{ fontSize: 12, padding: '5px 12px', color: next === 'CANCELLED' ? '#b91c1c' : undefined }}
                      disabled={saving} onClick={() => transition(po.id, next)}>
                      {statusLabel[next]}
                    </button>
                  ))}
                  {canReceive && (
                    <button className="sg-btn primary" style={{ fontSize: 12, padding: '5px 12px' }}
                      disabled={saving} onClick={() => openReceive(po)}>
                      {tr('Принять', 'Qabul qilish')}
                    </button>
                  )}
                </div>
              </div>

              {(po.items || []).length > 0 && (
                <table className="sg-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>{tr('Товар', 'Mahsulot')}</th>
                      <th>{tr('Заказ', 'Buyurtma')}</th>
                      <th>{tr('Принято', 'Qabul')}</th>
                      <th>{tr('Цена', 'Narx')}</th>
                      <th>{tr('Сумма', 'Summa')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((item: any) => (
                      <tr key={item.id}>
                        <td>{item.product?.name || item.productId}</td>
                        <td>{item.qty}</td>
                        <td>{item.qtyReceived ?? 0}</td>
                        <td>{Number(item.unitCost).toLocaleString(locale)}</td>
                        <td>{Number(item.totalCost).toLocaleString(locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 12, color: '#748278', flexWrap: 'wrap' }}>
                <span>{tr('Товары', 'Mahsulotlar')}: {Number(po.totalCost).toLocaleString(locale)}</span>
                {Number(po.shippingCost) > 0 && <span>{tr('Доставка', 'Yetkazib berish')}: {Number(po.shippingCost).toLocaleString(locale)}</span>}
                {Number(po.customsCost) > 0 && <span>{tr('Таможня', 'Bojxona')}: {Number(po.customsCost).toLocaleString(locale)}</span>}
              </div>
            </article>
          );
        })
      )}

      {receivePo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="sg-card" style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>
              {tr('Приёмка поставки', 'Yetkazib berishni qabul qilish')} PO-{receivePo.poNumber}
            </h3>
            <p className="sg-subtitle" style={{ marginBottom: 12 }}>
              {tr('Укажите фактически полученное количество', 'Amalda qabul qilingan miqdorni kiriting')}
            </p>
            {(receivePo.items || []).map((item: any) => (
              <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{item.product?.name || item.productId}</span>
                <span style={{ fontSize: 12, color: '#748278', whiteSpace: 'nowrap' }}>{tr('из', 'dan')} {item.qty}</span>
                <input type="number" min={0} max={item.qty}
                  value={receiveItems[item.id] ?? item.qty}
                  onChange={(e) => setReceiveItems((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                  style={{ width: 80, border: '1px solid #d6e0da', borderRadius: 8, padding: '6px 8px', fontSize: 13 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="sg-btn ghost" onClick={() => setReceivePo(null)} disabled={saving}>{tr('Отмена', 'Bekor')}</button>
              <button className="sg-btn primary" onClick={submitReceive} disabled={saving}>
                {saving ? tr('Сохранение...', 'Saqlanmoqda...') : tr('Подтвердить приёмку', 'Qabul qilishni tasdiqlash')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
