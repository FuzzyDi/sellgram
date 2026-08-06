import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';
import { ORDER_STATUS_VARIANT, PAYMENT_STATUS_VARIANT } from './orders/statusMeta';

const PAYMENT_STATUS_LABEL: Record<string, [string, string]> = {
  PENDING: ['Ожидает оплаты', "To'lov kutilmoqda"],
  PAID: ['Оплачен', "To'langan"],
  REFUNDED: ['Возврат', 'Qaytarilgan'],
};

const PAGE_SIZE = 20;

// A cancelled order never happened; a refunded one had its money returned —
// neither is "realized revenue", so both are excluded from the page-level
// sum even though they stay visible in the table with their status badge
// (decided with the user — this is a business-policy choice, not derived
// from any existing convention elsewhere in the codebase).
function isRealizedSale(order: any): boolean {
  return order.status !== 'CANCELLED' && order.status !== 'REFUNDED' && order.paymentStatus !== 'REFUNDED';
}

export default function Sales() {
  const { tr, locale } = useAdminI18n();

  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadOrders = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams();
    params.set('salesChannel', 'TELEGRAM');
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    if (search.trim()) params.set('search', search.trim());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    adminApi
      .getOrders(params.toString())
      .then(setData)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [page, search, dateFrom, dateTo]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Filters changing should always jump back to page 1 — otherwise a
  // narrower search could land on an out-of-range page with no results.
  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo]);

  const pageSum = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter(isRealizedSale).reduce((acc: number, o: any) => acc + Number(o.total || 0), 0);
  }, [data]);

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

  const columns: TableColumn<any>[] = [
    {
      key: 'expand',
      header: '',
      render: (o) => (
        <span className="text-neutral-400">
          {expandedId === o.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: tr('Дата', 'Sana'),
      render: (o) => new Date(o.createdAt).toLocaleString(locale),
    },
    {
      key: 'orderNumber',
      header: tr('№ заказа', 'Buyurtma №'),
      render: (o) => <span className="font-semibold text-neutral-800">#{o.orderNumber}</span>,
    },
    {
      key: 'customer',
      header: tr('Клиент', 'Mijoz'),
      render: (o) => {
        const name = `${o.customer?.firstName ?? ''} ${o.customer?.lastName ?? ''}`.trim();
        return name || o.customer?.phone || '—';
      },
    },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      // Two badges, same convention as Orders.tsx/OrderCard.tsx: order.status
      // (workflow stage) and paymentStatus (money) are independent — a
      // COMPLETED order can still have paymentStatus REFUNDED, which is
      // exactly the case the page-sum exclusion (isRealizedSale) depends
      // on, so it must stay visible here, not just implied by the total.
      render: (o) => (
        <div className="flex flex-col gap-1 items-start">
          <Badge variant={ORDER_STATUS_VARIANT[o.status] || 'neutral'}>{statusLabels[o.status] || o.status}</Badge>
          <Badge variant={PAYMENT_STATUS_VARIANT[o.paymentStatus] || 'neutral'}>
            {tr(...(PAYMENT_STATUS_LABEL[o.paymentStatus] || [o.paymentStatus, o.paymentStatus]))}
          </Badge>
        </div>
      ),
    },
    {
      key: 'total',
      header: tr('Сумма', 'Summa'),
      render: (o) => <span className="font-semibold text-neutral-800">{Number(o.total).toLocaleString(locale)} UZS</span>,
    },
  ];

  const expandedOrder = (data?.items ?? []).find((o: any) => o.id === expandedId) ?? null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-token-2xl font-semibold text-neutral-800 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-channel-sellgram" aria-hidden="true" />
            {tr('Продажи', 'Sotuvlar')}
          </h2>
          <p className="mt-1 text-token-sm text-neutral-500">
            {tr('Журнал заказов Telegram-канала — откройте заказ, чтобы увидеть позиции', "Telegram-kanal buyurtmalari jurnali — pozitsiyalarni ko'rish uchun buyurtmani oching")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-token-xs text-neutral-500 uppercase tracking-wide">
            {tr('Итого на странице', 'Sahifadagi jami')}
          </div>
          <div className="text-token-lg font-semibold text-neutral-800">
            {pageSum.toLocaleString(locale)} UZS
          </div>
        </div>
      </header>

      <Card>
        <div className="grid grid-cols-3 gap-3">
          <Input
            label={tr('Поиск', 'Qidiruv')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('№ заказа, имя, телефон', "Buyurtma №, ism, telefon")}
          />
          <Input type="date" label={tr('Дата с', 'Dan sana')} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" label={tr('Дата по', 'Gacha sana')} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </Card>

      {loadError ? (
        <Card className="text-center py-8 px-4">
          <p className="text-token-sm text-danger">{tr('Не удалось загрузить заказы', "Buyurtmalarni yuklab bo'lmadi")}</p>
        </Card>
      ) : (
        <>
          <Table
            columns={columns}
            data={data?.items ?? []}
            rowKey={(o) => o.id}
            loading={loading}
            onRowClick={(o) => setExpandedId((prev) => (prev === o.id ? null : o.id))}
            emptyMessage={tr('Заказов нет', "Buyurtmalar yo'q")}
          />

          {expandedOrder && (
            <Card className="border-l-4 border-l-brand-500">
              <h3 className="m-0 mb-3 text-token-base font-semibold text-neutral-800">
                {tr('Позиции заказа', 'Buyurtma pozitsiyalari')} #{expandedOrder.orderNumber}
              </h3>
              <table className="w-full text-token-sm border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left py-1.5 pr-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Товар', 'Mahsulot')}</th>
                    <th className="text-right py-1.5 px-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Кол-во', 'Soni')}</th>
                    <th className="text-right py-1.5 px-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Цена', 'Narxi')}</th>
                    <th className="text-right py-1.5 pl-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Сумма', 'Summa')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(expandedOrder.items ?? []).map((item: any) => (
                    <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                      <td className="py-1.5 pr-2 text-neutral-800">
                        {item.name}{item.variantName ? ` · ${item.variantName}` : ''}
                      </td>
                      <td className="py-1.5 px-2 text-right text-neutral-600">{item.qty}</td>
                      <td className="py-1.5 px-2 text-right text-neutral-600">{Number(item.price).toLocaleString(locale)}</td>
                      <td className="py-1.5 pl-2 text-right font-semibold text-neutral-800">{Number(item.total).toLocaleString(locale)}</td>
                    </tr>
                  ))}
                  {(!expandedOrder.items || expandedOrder.items.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-3 text-center text-neutral-500">{tr('Нет позиций', "Pozitsiyalar yo'q")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="ghost" size="md" type="button"
              disabled={(data?.page || page) <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {tr('Назад', 'Orqaga')}
            </Button>
            <span className="text-token-sm text-neutral-500">
              {tr('Страница', 'Sahifa')} {data?.page || page} / {Math.max(1, data?.totalPages || 1)}
            </span>
            <Button
              variant="ghost" size="md" type="button"
              disabled={(data?.page || page) >= Math.max(1, data?.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              {tr('Далее', 'Keyingi')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
