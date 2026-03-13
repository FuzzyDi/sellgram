import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  PREPARING: 'bg-yellow-100 text-yellow-700',
  READY: 'bg-indigo-100 text-indigo-700',
  SHIPPED: 'bg-purple-100 text-purple-700',
  DELIVERED: 'bg-teal-100 text-teal-700',
  COMPLETED: 'bg-green-200 text-green-800',
  CANCELLED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-gray-100 text-gray-700',
};

export default function Orders() {
  const { tr, locale } = useAdminI18n();
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const statusLabels: Record<string, string> = {
    NEW: tr('New', 'Yangi'),
    CONFIRMED: tr('Confirmed', 'Tasdiqlandi'),
    PREPARING: tr('Preparing', 'Tayyorlanmoqda'),
    READY: tr('Ready', 'Tayyor'),
    SHIPPED: tr('Shipped', "Yo'lda"),
    DELIVERED: tr('Delivered', 'Yetkazildi'),
    COMPLETED: tr('Completed', 'Yakunlandi'),
    CANCELLED: tr('Cancelled', 'Bekor qilindi'),
    REFUNDED: tr('Refunded', 'Qaytarildi'),
  };

  const loadOrders = useCallback(() => {
    setLoading(true);
    adminApi.getOrders(filter ? `status=${filter}` : '').then(setData).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    loadOrders();
  }, [filter]);

  const handleStatusChange = useCallback(async (orderId: string, newStatus: string) => {
    try {
      await adminApi.updateOrderStatus(orderId, { status: newStatus });
      loadOrders();
    } catch (err: any) {
      alert(err.message);
    }
  }, [loadOrders]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">?? {tr('Orders', 'Buyurtmalar')}</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        {['', 'NEW', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED'].map((s) => (
          <Button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filter === s ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600'}`}
          >
            {s ? statusLabels[s] : tr('All', 'Barchasi')}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400">{tr('Loading...', 'Yuklanmoqda...')}</p>
      ) : (
        <div className="space-y-3">
          {data?.items?.map((order: any) => (
            <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <p className="font-bold">{tr('Order', 'Buyurtma')} #{order.orderNumber}</p>
                  <p className="text-sm text-gray-500">
                    {order.customer?.firstName} {order.customer?.lastName}
                    {order.customer?.telegramUser && ` (@${order.customer.telegramUser})`}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                  {statusLabels[order.status]}
                </span>
              </div>

              <div className="text-sm text-gray-600 mb-2">
                {order.items?.map((i: any) => `${i.name} ?${i.qty}`).join(', ')}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p className="font-bold text-blue-600">{Number(order.total).toLocaleString()} UZS</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {order.status === 'NEW' && (
                    <>
                      <Button onClick={() => handleStatusChange(order.id, 'CONFIRMED')} className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg">? {tr('Confirm', 'Tasdiqlash')}</Button>
                      <Button onClick={() => handleStatusChange(order.id, 'CANCELLED')} className="px-3 py-1 bg-red-500 text-white text-xs rounded-lg">? {tr('Cancel', 'Bekor qilish')}</Button>
                    </>
                  )}
                  {order.status === 'CONFIRMED' && (
                    <Button onClick={() => handleStatusChange(order.id, 'PREPARING')} className="px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg">?? {tr('Prepare', 'Tayyorlash')}</Button>
                  )}
                  {order.status === 'PREPARING' && (
                    <Button onClick={() => handleStatusChange(order.id, 'READY')} className="px-3 py-1 bg-indigo-500 text-white text-xs rounded-lg">? {tr('Ready', 'Tayyor')}</Button>
                  )}
                  {order.status === 'READY' && (
                    <Button onClick={() => handleStatusChange(order.id, 'SHIPPED')} className="px-3 py-1 bg-purple-500 text-white text-xs rounded-lg">?? {tr('Ship', "Jo'natish")}</Button>
                  )}
                  {order.status === 'SHIPPED' && (
                    <Button onClick={() => handleStatusChange(order.id, 'DELIVERED')} className="px-3 py-1 bg-teal-500 text-white text-xs rounded-lg">?? {tr('Delivered', 'Yetkazildi')}</Button>
                  )}
                  {order.status === 'DELIVERED' && (
                    <Button onClick={() => handleStatusChange(order.id, 'COMPLETED')} className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg">?? {tr('Complete', 'Yakunlash')}</Button>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-2">{new Date(order.createdAt).toLocaleString(locale)}</p>
            </div>
          ))}
          {data?.items?.length === 0 && <p className="text-center text-gray-400 py-8">{tr('No orders', "Buyurtmalar yo'q")}</p>}
        </div>
      )}
    </div>
  );
}
