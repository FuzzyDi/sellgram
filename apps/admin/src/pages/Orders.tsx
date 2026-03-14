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
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

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

  const loadOrders = useCallback(() => {
    setLoading(true);
    adminApi
      .getOrders(filter ? `status=${filter}` : '')
      .then(setData)
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleStatusChange = useCallback(
    async (orderId: string, newStatus: string) => {
      try {
        await adminApi.updateOrderStatus(orderId, { status: newStatus });
        loadOrders();
      } catch (err: any) {
        alert(err.message);
      }
    },
    [loadOrders]
  );

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header>
        <h2 className="sg-title">{tr('Заказы', 'Buyurtmalar')}</h2>
        <p className="sg-subtitle">{tr('Управление входящими заказами и статусами', 'Buyurtmalar va statuslarni boshqarish')}</p>
      </header>

      <div className="sg-pill-row">
        {['', 'NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].map((s) => (
          <button key={s || 'all'} onClick={() => setFilter(s)} className={`sg-pill ${filter === s ? 'active' : ''}`}>
            {s ? statusLabels[s] : tr('Все', 'Barchasi')}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="sg-subtitle">{tr('Загрузка...', 'Yuklanmoqda...')}</p>
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
                  </div>
                </div>
                <span className="sg-badge" style={{ background: `${statusColors[order.status] || '#4b5563'}1a`, color: statusColors[order.status] || '#4b5563' }}>
                  {statusLabels[order.status]}
                </span>
              </div>

              <div style={{ fontSize: 14, color: '#4d5c53', marginTop: 8 }}>
                {order.items?.map((i: any) => `${i.name} x${i.qty}`).join(', ')}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: '#00875a' }}>{Number(order.total).toLocaleString()} UZS</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {order.status === 'NEW' && (
                    <>
                      <Button onClick={() => handleStatusChange(order.id, 'CONFIRMED')} className="sg-btn primary">
                        {tr('Подтвердить', 'Tasdiqlash')}
                      </Button>
                      <Button onClick={() => handleStatusChange(order.id, 'CANCELLED')} className="sg-btn danger">
                        {tr('Отменить', 'Bekor qilish')}
                      </Button>
                    </>
                  )}
                  {order.status === 'CONFIRMED' && (
                    <Button onClick={() => handleStatusChange(order.id, 'PREPARING')} className="sg-btn ghost">
                      {tr('Готовить', 'Tayyorlash')}
                    </Button>
                  )}
                  {order.status === 'PREPARING' && (
                    <Button onClick={() => handleStatusChange(order.id, 'READY')} className="sg-btn ghost">
                      {tr('Готов', 'Tayyor')}
                    </Button>
                  )}
                  {order.status === 'READY' && (
                    <Button onClick={() => handleStatusChange(order.id, 'SHIPPED')} className="sg-btn ghost">
                      {tr('Отправить', "Jo'natish")}
                    </Button>
                  )}
                  {order.status === 'SHIPPED' && (
                    <Button onClick={() => handleStatusChange(order.id, 'DELIVERED')} className="sg-btn ghost">
                      {tr('Доставлен', 'Yetkazildi')}
                    </Button>
                  )}
                  {order.status === 'DELIVERED' && (
                    <Button onClick={() => handleStatusChange(order.id, 'COMPLETED')} className="sg-btn primary">
                      {tr('Завершить', 'Yakunlash')}
                    </Button>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 8, fontSize: 12, color: '#839188' }}>{new Date(order.createdAt).toLocaleString(locale)}</div>
            </article>
          ))}

          {data?.items?.length === 0 && <p className="sg-subtitle">{tr('Заказов нет', "Buyurtmalar yo'q")}</p>}
        </div>
      )}
    </section>
  );
}
