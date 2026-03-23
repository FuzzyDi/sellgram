import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

const statusColors: Record<string, string> = {
  NEW: '#1d4ed8',
  CONFIRMED: '#047857',
  PREPARING: '#b45309',
  READY: '#4338ca',
  SHIPPED: '#6d28d9',
  DELIVERED: '#0f766e',
  COMPLETED: '#166534',
  CANCELLED: '#b91c1c',
  REFUNDED: '#4b5563',
};

export default function Orders() {
  const { tr, locale } = useAdminI18n();
  const [data, setData] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<Set<string>>(new Set());
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<Record<string, any>>({});
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    orderId: string;
    orderTotal: number;
    action: 'cancel' | 'refund';
  } | null>(null);
  const [dialogReason, setDialogReason] = useState('');
  const [dialogRefundAmount, setDialogRefundAmount] = useState('');

  function showNotice(tone: 'success' | 'error', message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const statusLabels: Record<string, string> = useMemo(
    () => ({
      NEW: tr('Новый', 'Yangi'),
      CONFIRMED: tr('Подтвержден', 'Tasdiqlandi'),
      PREPARING: tr('Готовится', 'Tayyorlanmoqda'),
      READY: tr('Готов', 'Tayyor'),
      SHIPPED: tr('В пути', "Yo'lda"),
      DELIVERED: tr('Доставлен', 'Yetkazildi'),
      COMPLETED: tr('Завершен', 'Yakunlandi'),
      CANCELLED: tr('Отменен', 'Bekor qilindi'),
      REFUNDED: tr('Возврат', 'Qaytarildi'),
    }),
    [tr]
  );

  const paymentLabels: Record<string, string> = useMemo(
    () => ({
      PENDING: tr('Ожидает оплаты', "To'lov kutilmoqda"),
      PAID: tr('Оплачен', "To'langan"),
      REFUNDED: tr('Возврат', 'Qaytarilgan'),
    }),
    [tr]
  );

  const loadOrders = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (statusFilter) params.set('status', statusFilter);
    if (paymentFilter) params.set('paymentStatus', paymentFilter);
    if (search.trim()) params.set('search', search.trim());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    adminApi
      .getOrders(params.toString())
      .then(setData)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [page, statusFilter, paymentFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const toggleOrder = useCallback(async (orderId: string) => {
    if (expandedOrder === orderId) { setExpandedOrder(null); return; }
    setExpandedOrder(orderId);
    if (!orderDetails[orderId]) {
      try {
        const detail = await adminApi.getOrder(orderId);
        setOrderDetails((prev) => ({ ...prev, [orderId]: detail }));
      } catch {}
    }
  }, [expandedOrder, orderDetails]);

  const handleStatusChange = useCallback(
    async (orderId: string, newStatus: string) => {
      if (pendingOrders.has(orderId)) return;
      setPendingOrders((prev) => new Set(prev).add(orderId));
      try {
        await adminApi.updateOrderStatus(orderId, { status: newStatus });
        loadOrders();
      } catch (err: any) {
        showNotice('error', err?.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
      } finally {
        setPendingOrders((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    },
    [loadOrders, pendingOrders]
  );

  function openActionDialog(orderId: string, orderTotal: number, action: 'cancel' | 'refund') {
    setDialogReason('');
    setDialogRefundAmount(String(orderTotal));
    setActionDialog({ orderId, orderTotal, action });
  }

  async function submitAction() {
    if (!actionDialog) return;
    const { orderId, action } = actionDialog;
    const payload: any = {
      status: action === 'cancel' ? 'CANCELLED' : 'REFUNDED',
      cancelReason: dialogReason.trim() || undefined,
    };
    if (action === 'refund' && dialogRefundAmount) {
      payload.refundAmount = Number(dialogRefundAmount);
    }
    setActionDialog(null);
    if (pendingOrders.has(orderId)) return;
    setPendingOrders((prev) => new Set(prev).add(orderId));
    try {
      await adminApi.updateOrderStatus(orderId, payload);
      loadOrders();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setPendingOrders((prev) => { const next = new Set(prev); next.delete(orderId); return next; });
    }
  }

  const noticeNode = notice ? (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 200, minWidth: 260, maxWidth: 420,
      borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 700,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', animation: 'sg-fade-in 0.2s ease both',
      color: notice.tone === 'error' ? '#991b1b' : '#065f46',
      background: notice.tone === 'error' ? '#fee2e2' : '#d1fae5',
      border: `1px solid ${notice.tone === 'error' ? '#fecaca' : '#a7f3d0'}`,
    }}>
      {notice.message}
    </div>
  ) : null;

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}
      <header>
        <h2 className="sg-title">{tr('Заказы', 'Buyurtmalar')}</h2>
        <p className="sg-subtitle">{tr('Управление входящими заказами и статусами', 'Buyurtmalar va statuslarni boshqarish')}</p>
      </header>

      <div className="sg-card" style={{ display: 'grid', gap: 10 }}>
        <div className="sg-pill-row">
          {['', 'NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => {
                setPage(1);
                setStatusFilter(s);
              }}
              className={`sg-pill ${statusFilter === s ? 'active' : ''}`}
            >
              {s ? statusLabels[s] : tr('Все', 'Barchasi')}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={paymentFilter}
            onChange={(e) => { setPage(1); setPaymentFilter(e.target.value); }}
            style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
          >
            <option value="">{tr('Любая оплата', "To'lov: barchasi")}</option>
            <option value="PENDING">{paymentLabels.PENDING}</option>
            <option value="PAID">{paymentLabels.PAID}</option>
            <option value="REFUNDED">{paymentLabels.REFUNDED}</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setPage(1); setDateFrom(e.target.value); }}
            style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
            title={tr('Дата с', 'Dan sana')}
          />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setPage(1); setDateTo(e.target.value); }}
            style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
            title={tr('Дата по', 'Gacha sana')}
          />
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder={tr('Поиск: № заказа, клиент, телефон', 'Qidiruv: buyurtma №, mijoz, telefon')}
            style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13, minWidth: 240, flex: 1 }}
          />
            {(statusFilter || paymentFilter || search || dateFrom || dateTo) && (
            <button
              onClick={() => { setStatusFilter(''); setPaymentFilter(''); setSearch(''); setDateFrom(''); setDateTo(''); setPage(1); }}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 12px', fontSize: 12, background: 'transparent', cursor: 'pointer', color: '#6b7280', whiteSpace: 'nowrap' }}
            >
              {tr('Сбросить', 'Tozalash')}
            </button>
          )}
          <button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const p = new URLSearchParams();
                if (statusFilter) p.set('status', statusFilter);
                if (paymentFilter) p.set('paymentStatus', paymentFilter);
                if (dateFrom) p.set('dateFrom', dateFrom);
                if (dateTo) p.set('dateTo', dateTo);
                await adminApi.downloadOrdersCsv(p.toString() || undefined);
              } catch {
                showNotice('error', tr('Ошибка экспорта', 'Eksport xatoligi'));
              } finally {
                setExporting(false);
              }
            }}
            style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 12px', fontSize: 12, background: 'transparent', cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}
          >
            {exporting ? '...' : tr('↓ CSV', '↓ CSV')}
          </button>
        </div>
        {data && !loading && (
          <p style={{ margin: 0, fontSize: 12, color: '#748278' }}>
            {tr('Найдено', 'Topildi')}: <strong>{data.total}</strong>
          </p>
        )}
      </div>

      {loadError ? (
        <div className="sg-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#be123c' }}>{tr('Не удалось загрузить заказы', "Buyurtmalarni yuklab bo'lmadi")}</p>
          <button className="sg-btn ghost" style={{ marginTop: 14 }} onClick={loadOrders}>{tr('Повторить', 'Qayta urinish')}</button>
        </div>
      ) : loading ? (
        <div className="sg-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="sg-card" style={{ display: 'grid', gap: 10 }}>
              <div className="sg-skeleton" style={{ height: 20, width: '40%' }} />
              <div className="sg-skeleton" style={{ height: 14, width: '60%' }} />
              <div className="sg-skeleton" style={{ height: 14, width: '80%' }} />
              <div className="sg-skeleton" style={{ height: 32, width: '30%' }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="sg-grid">
          {data?.items?.map((order: any) => (
            <article key={order.id} className="sg-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {tr('Заказ', 'Buyurtma')} #{order.orderNumber}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: '#64756b' }}>
                    {order.customer?.firstName} {order.customer?.lastName}
                    {order.customer?.telegramUser ? ` (@${order.customer.telegramUser})` : ''}
                    {order.customer?.phone ? ` • ${order.customer.phone}` : ''}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <span className="sg-badge" style={{ background: `${statusColors[order.status] || '#4b5563'}1a`, color: statusColors[order.status] || '#4b5563' }}>
                    {statusLabels[order.status]}
                  </span>
                  <span className="sg-badge" style={{
                    background: order.paymentStatus === 'PAID' ? '#d1fae5' : order.paymentStatus === 'REFUNDED' ? '#fee2e2' : '#fef3c7',
                    color: order.paymentStatus === 'PAID' ? '#065f46' : order.paymentStatus === 'REFUNDED' ? '#991b1b' : '#92400e',
                  }}>
                    {paymentLabels[order.paymentStatus] || order.paymentStatus}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: 14, color: '#4d5c53', marginTop: 8 }}>
                {order.items?.map((i: any) => `${i.name} x${i.qty}`).join(', ')}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: '#00875a' }}>{Number(order.total).toLocaleString()} UZS</div>
                  {order.promoCode && (
                    <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, background: '#f0f9ff', color: '#0369a1', padding: '2px 8px', borderRadius: 6 }}>
                      🏷 {order.promoCode.code}
                    </span>
                  )}
                  {Number(order.loyaltyDiscount) > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: 6 }}>
                      ⭐ −{Number(order.loyaltyDiscount).toLocaleString()}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {order.status === 'NEW' && (
                    <>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => handleStatusChange(order.id, 'CONFIRMED')} className="sg-btn primary">
                        {tr('Подтвердить', 'Tasdiqlash')}
                      </Button>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => openActionDialog(order.id, Number(order.total), 'cancel')} className="sg-btn danger">
                        {tr('Отменить', 'Bekor qilish')}
                      </Button>
                    </>
                  )}
                  {order.status === 'CONFIRMED' && (
                    <>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => handleStatusChange(order.id, 'PREPARING')} className="sg-btn ghost">
                        {tr('Готовить', 'Tayyorlash')}
                      </Button>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => openActionDialog(order.id, Number(order.total), 'cancel')} className="sg-btn danger">
                        {tr('Отменить', 'Bekor qilish')}
                      </Button>
                    </>
                  )}
                  {order.status === 'PREPARING' && (
                    <>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => handleStatusChange(order.id, 'READY')} className="sg-btn ghost">
                        {tr('Готов', 'Tayyor')}
                      </Button>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => openActionDialog(order.id, Number(order.total), 'cancel')} className="sg-btn danger">
                        {tr('Отменить', 'Bekor qilish')}
                      </Button>
                    </>
                  )}
                  {order.status === 'READY' && (
                    <>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => handleStatusChange(order.id, 'SHIPPED')} className="sg-btn ghost">
                        {tr('Отправить', "Jo'natish")}
                      </Button>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => openActionDialog(order.id, Number(order.total), 'cancel')} className="sg-btn danger">
                        {tr('Отменить', 'Bekor qilish')}
                      </Button>
                    </>
                  )}
                  {order.status === 'SHIPPED' && (
                    <Button disabled={pendingOrders.has(order.id)} onClick={() => handleStatusChange(order.id, 'DELIVERED')} className="sg-btn ghost">
                      {tr('Доставлен', 'Yetkazildi')}
                    </Button>
                  )}
                  {order.status === 'DELIVERED' && (
                    <>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => handleStatusChange(order.id, 'COMPLETED')} className="sg-btn primary">
                        {tr('Завершить', 'Yakunlash')}
                      </Button>
                      <Button disabled={pendingOrders.has(order.id)} onClick={() => openActionDialog(order.id, Number(order.total), 'refund')} className="sg-btn danger">
                        {tr('Возврат', 'Qaytarish')}
                      </Button>
                    </>
                  )}
                  {order.status === 'COMPLETED' && (
                    <Button disabled={pendingOrders.has(order.id)} onClick={() => openActionDialog(order.id, Number(order.total), 'refund')} className="sg-btn danger">
                      {tr('Возврат', 'Qaytarish')}
                    </Button>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#839188' }}>{new Date(order.createdAt).toLocaleString(locale)}</span>
                <button
                  onClick={() => toggleOrder(order.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#748278', padding: '2px 6px' }}
                >
                  {expandedOrder === order.id ? '▲' : '▼'} {tr('История', 'Tarix')}
                </button>
              </div>

              {expandedOrder === order.id && (
                <div style={{ marginTop: 10, borderTop: '1px solid #edf2ee', paddingTop: 10 }}>
                  {order.cancelReason && (
                    <div style={{ marginBottom: 8, padding: '8px 10px', background: '#fee2e2', borderRadius: 8, fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: '#991b1b' }}>{tr('Причина: ', 'Sabab: ')}</span>
                      <span style={{ color: '#7f1d1d' }}>{order.cancelReason}</span>
                    </div>
                  )}
                  {order.refundAmount != null && (
                    <div style={{ marginBottom: 8, padding: '8px 10px', background: '#fef3c7', borderRadius: 8, fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: '#92400e' }}>{tr('Сумма возврата: ', 'Qaytarish summasi: ')}</span>
                      <span style={{ color: '#78350f' }}>{Number(order.refundAmount).toLocaleString()} UZS</span>
                    </div>
                  )}
                  {!orderDetails[order.id] ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[1,2].map((i) => <div key={i} className="sg-skeleton" style={{ height: 12, width: i === 1 ? '60%' : '40%' }} />)}
                    </div>
                  ) : orderDetails[order.id]?.statusHistory?.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>{tr('История изменений пуста', 'O\'zgarishlar tarixi bo\'sh')}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(orderDetails[order.id]?.statusHistory || []).map((h: any, idx: number) => (
                        <div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: idx === 0 ? '#00875a' : '#d1d5db', marginTop: 4, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              {h.fromStatus && (
                                <>
                                  <span className="sg-badge" style={{ background: '#f3f4f6', color: '#4b5563', fontSize: 11 }}>{statusLabels[h.fromStatus] || h.fromStatus}</span>
                                  <span style={{ color: '#9ca3af' }}>→</span>
                                </>
                              )}
                              <span className="sg-badge" style={{ background: `${statusColors[h.toStatus] || '#4b5563'}1a`, color: statusColors[h.toStatus] || '#4b5563', fontSize: 11 }}>{statusLabels[h.toStatus] || h.toStatus}</span>
                            </div>
                            <div style={{ marginTop: 2, color: '#9ca3af' }}>
                              {h.actor ? (h.actor.name || h.actor.email) : tr('Система', 'Tizim')}
                              {' · '}
                              {new Date(h.createdAt).toLocaleString(locale)}
                            </div>
                            {h.note && <div style={{ marginTop: 2, color: '#5f6d64', fontStyle: 'italic' }}>{h.note}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}

          {data?.items?.length === 0 && <p className="sg-subtitle">{tr('Заказов нет', "Buyurtmalar yo'q")}</p>}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="sg-subtitle" style={{ margin: 0 }}>
              {tr('Страница', 'Sahifa')} {data?.page || page} / {Math.max(1, data?.totalPages || 1)}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button className="sg-btn ghost" disabled={(data?.page || page) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {tr('Назад', 'Orqaga')}
              </Button>
              <Button className="sg-btn ghost" disabled={(data?.page || page) >= Math.max(1, data?.totalPages || 1)} onClick={() => setPage((p) => p + 1)}>
                {tr('Далее', 'Keyingi')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {actionDialog && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div className="sg-card" style={{ width: '100%', maxWidth: 460 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {actionDialog.action === 'cancel'
                ? tr('Отмена заказа', 'Buyurtmani bekor qilish')
                : tr('Возврат', 'Qaytarish')}
            </h3>

            <div className="sg-grid" style={{ gap: 10, marginTop: 14 }}>
              <textarea
                autoFocus
                value={dialogReason}
                onChange={(e) => setDialogReason(e.target.value)}
                placeholder={
                  actionDialog.action === 'cancel'
                    ? tr('Причина отмены (необязательно)', 'Bekor qilish sababi (ixtiyoriy)')
                    : tr('Причина возврата (необязательно)', 'Qaytarish sababi (ixtiyoriy)')
                }
                rows={3}
                style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', resize: 'vertical', boxSizing: 'border-box' }}
              />
              {actionDialog.action === 'refund' && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    {tr('Сумма возврата', 'Qaytarish summasi')}
                  </label>
                  <input
                    type="number"
                    value={dialogRefundAmount}
                    onChange={(e) => setDialogRefundAmount(e.target.value)}
                    min={0}
                    max={actionDialog.orderTotal}
                    style={{ width: '100%', border: '1px solid #d6e0da', borderRadius: 10, padding: '9px 11px', boxSizing: 'border-box' }}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7a71' }}>
                    {tr('Макс:', 'Maks:')} {actionDialog.orderTotal.toLocaleString()} UZS
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="sg-btn danger" type="button" onClick={() => void submitAction()}>
                  {actionDialog.action === 'cancel' ? tr('Отменить заказ', 'Bekor qilish') : tr('Оформить возврат', "Qaytarishni rasmiylashtirish")}
                </button>
                <button className="sg-btn ghost" type="button" onClick={() => setActionDialog(null)}>
                  {tr('Отмена', 'Bekor')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
