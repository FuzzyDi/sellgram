import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
import Card from '../components/Card';
import { useAdminI18n } from '../i18n';
import OrdersFilters from './orders/OrdersFilters';
import OrderCard from './orders/OrderCard';
import ShipDialog from './orders/ShipDialog';
import ActionDialog, { type ActionDialogState } from './orders/ActionDialog';

export default function Orders() {
  const { tr } = useAdminI18n();
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
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [dialogReason, setDialogReason] = useState('');
  const [dialogRefundAmount, setDialogRefundAmount] = useState('');
  const [shipDialog, setShipDialog] = useState<{ orderId: string } | null>(null);
  const [trackingInput, setTrackingInput] = useState('');

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
        showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
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

  function openShipDialog(orderId: string) {
    setTrackingInput('');
    setShipDialog({ orderId });
  }

  async function submitShip() {
    if (!shipDialog) return;
    const { orderId } = shipDialog;
    setShipDialog(null);
    if (pendingOrders.has(orderId)) return;
    setPendingOrders((prev) => new Set(prev).add(orderId));
    try {
      await adminApi.updateOrderStatus(orderId, {
        status: 'SHIPPED',
        ...(trackingInput.trim() ? { trackingNumber: trackingInput.trim() } : {}),
      });
      loadOrders();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    } finally {
      setPendingOrders((prev) => { const next = new Set(prev); next.delete(orderId); return next; });
    }
  }

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
    <div
      className={[
        'fixed right-4 top-4 z-[200] min-w-[260px] max-w-[420px] rounded-token-lg px-4 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30',
      ].join(' ')}
    >
      {notice.message}
    </div>
  ) : null;

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <header>
        <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Заказы', 'Buyurtmalar')}</h2>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Управление входящими заказами и статусами', 'Buyurtmalar va statuslarni boshqarish')}</p>
      </header>

      <OrdersFilters
        statusFilter={statusFilter}
        onStatusFilterChange={(s) => { setPage(1); setStatusFilter(s); }}
        statusLabels={statusLabels}
        paymentFilter={paymentFilter}
        onPaymentFilterChange={(v) => { setPage(1); setPaymentFilter(v); }}
        paymentLabels={paymentLabels}
        dateFrom={dateFrom}
        onDateFromChange={(v) => { setPage(1); setDateFrom(v); }}
        dateTo={dateTo}
        onDateToChange={(v) => { setPage(1); setDateTo(v); }}
        search={search}
        onSearchChange={(v) => { setPage(1); setSearch(v); }}
        onReset={() => { setStatusFilter(''); setPaymentFilter(''); setSearch(''); setDateFrom(''); setDateTo(''); setPage(1); }}
        exporting={exporting}
        onExport={async () => {
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
        total={data?.total}
        showTotal={!!data && !loading}
      />

      {loadError ? (
        <Card className="text-center py-8 px-4">
          <p className="m-0 font-semibold text-danger">{tr('Не удалось загрузить заказы', "Buyurtmalarni yuklab bo'lmadi")}</p>
          <Button variant="ghost" size="md" type="button" className="mt-3.5" onClick={loadOrders}>{tr('Повторить', 'Qayta urinish')}</Button>
        </Card>
      ) : loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex flex-col gap-2.5">
              <div className="h-5 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-3.5 w-3/5 rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-3.5 w-4/5 rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-8 w-1/3 rounded-token-sm bg-neutral-100 animate-pulse" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {data?.items?.map((order: any) => (
            <OrderCard
              key={order.id}
              order={order}
              pending={pendingOrders.has(order.id)}
              statusLabels={statusLabels}
              paymentLabels={paymentLabels}
              expanded={expandedOrder === order.id}
              orderDetail={orderDetails[order.id]}
              onToggle={() => void toggleOrder(order.id)}
              onStatusChange={(status) => void handleStatusChange(order.id, status)}
              onOpenShipDialog={() => openShipDialog(order.id)}
              onOpenActionDialog={(action) => openActionDialog(order.id, Number(order.total), action)}
            />
          ))}

          {data?.items?.length === 0 && <p className="text-token-sm text-neutral-500">{tr('Заказов нет', "Buyurtmalar yo'q")}</p>}

          <div className="flex justify-between items-center gap-2">
            <span className="text-token-sm text-neutral-500">
              {tr('Страница', 'Sahifa')} {data?.page || page} / {Math.max(1, data?.totalPages || 1)}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="md" type="button" disabled={(data?.page || page) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {tr('Назад', 'Orqaga')}
              </Button>
              <Button variant="ghost" size="md" type="button" disabled={(data?.page || page) >= Math.max(1, data?.totalPages || 1)} onClick={() => setPage((p) => p + 1)}>
                {tr('Далее', 'Keyingi')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {shipDialog && (
        <ShipDialog
          trackingInput={trackingInput}
          setTrackingInput={setTrackingInput}
          onClose={() => setShipDialog(null)}
          onSubmit={() => void submitShip()}
        />
      )}

      {actionDialog && (
        <ActionDialog
          actionDialog={actionDialog}
          dialogReason={dialogReason}
          setDialogReason={setDialogReason}
          dialogRefundAmount={dialogRefundAmount}
          setDialogRefundAmount={setDialogRefundAmount}
          onClose={() => setActionDialog(null)}
          onSubmit={() => void submitAction()}
        />
      )}
    </section>
  );
}
