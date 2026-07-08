import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';
import RevenueChart from './dashboard/RevenueChart';

export default function Dashboard() {
  const { tr } = useAdminI18n();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    Promise.all([
      adminApi.getDashboard(),
      adminApi.getTopProducts().catch(() => []),
      adminApi.getSubscription().catch(() => null),
      adminApi.getOrders('page=1&pageSize=5&status=NEW').catch(() => null),
    ])
      .then(([s, tp, subscription, newOrders]) => {
        setStats(s);
        setTopProducts(Array.isArray(tp) ? tp : tp?.items || tp?.data || []);
        setSub(subscription);
        setRecentOrders(newOrders?.items || []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const checks = useMemo(() => {
    const usage = sub?.usage;
    const productCount = stats?.products?.total ?? stats?.totalProducts ?? 0;

    return [
      {
        done: true,
        label: tr('Регистрация завершена', "Ro'yxatdan o'tish yakunlandi"),
        desc: tr('Отличный старт!', 'Ajoyib start!'),
      },
      {
        done: productCount > 0,
        label: tr('Добавьте товары', "Mahsulot qo'shing"),
        desc: tr('Товары > Добавить', "Mahsulotlar > Qo'shish"),
        to: '/products',
      },
      {
        done: productCount > 0,
        label: tr('Загрузите фото', 'Rasm yuklang'),
        desc: tr('Откройте товар > Фото', 'Mahsulotni oching > Rasmlar'),
        to: '/products',
      },
      {
        done: (usage?.stores?.current || 0) > 0,
        label: tr('Подключите бота', 'Botni ulang'),
        desc: tr('Настройки > Редактировать > Токен бота', 'Sozlamalar > Tahrirlash > Bot token'),
        to: '/settings',
      },
      {
        done: (usage?.deliveryZones?.current || 0) > 0,
        label: tr('Настройте доставку', 'Yetkazib berishni sozlang'),
        desc: tr('Настройки > Доставка', 'Sozlamalar > Yetkazib berish'),
        to: '/settings',
      },
    ];
  }, [stats, sub, tr]);

  const completedSteps = checks.filter((c) => c.done).length;
  const totalSteps = checks.length;

  const ordersToday = stats?.orders?.today ?? stats?.ordersToday ?? 0;
  const ordersPending = stats?.orders?.pending ?? 0;
  const revenueToday = stats?.revenue?.today ?? 0;
  const revenueMonth = stats?.revenue?.month ?? stats?.revenueMonth ?? 0;
  const avgCheck = stats?.revenue?.avgCheck ?? 0;
  const newCustomersWeek = stats?.customers?.newThisWeek ?? 0;
  const reviewAvg: number | null = stats?.reviews?.avg ?? null;
  const reviewCount: number = stats?.reviews?.count ?? 0;
  const totalCustomers = Math.max(
    stats?.customers?.total ?? 0,
    stats?.customers?.fromOrders ?? 0,
    stats?.totalCustomers ?? 0
  );
  const topProductsDerived = Array.isArray(topProducts)
    ? new Set(topProducts.map((p: any) => p?.product?.id || p?.productId || p?.id || p?.productName || p?.name).filter(Boolean)).size
    : 0;
  const totalProducts = Math.max(stats?.products?.total ?? stats?.totalProducts ?? 0, topProductsDerived);

  const resolveProductName = (p: any, index: number) => {
    const raw = p?.product?.name ?? p?.productName ?? p?.name ?? '';
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    return normalized || `${tr('Товар', 'Mahsulot')} #${index + 1}`;
  };

  const expiryInfo = useMemo(() => {
    if (!sub?.planExpiresAt) return null;
    const now = new Date();
    const expires = new Date(sub.planExpiresAt);
    if (Number.isNaN(expires.getTime())) return null;
    const ms = expires.getTime() - now.getTime();
    const daysLeft = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return {
      daysLeft,
      isExpired: ms <= 0,
      expiresAt: expires,
    };
  }, [sub?.planExpiresAt]);

  const rankedTopProducts = topProducts.slice(0, 7).map((p: any, i: number) => ({ ...p, __index: i }));

  const topProductsColumns: TableColumn<any>[] = [
    { key: 'rank', header: '#', width: 32, render: (row) => row.__index + 1 },
    { key: 'name', header: tr('Товар', 'Mahsulot'), render: (row) => resolveProductName(row, row.__index) },
    { key: 'revenue', header: tr('Выручка', 'Tushum'), render: (row) => `${Number(row.totalRevenue || row.revenue || 0).toLocaleString()} UZS` },
  ];

  if (error) {
    return (
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Дашборд', 'Boshqaruv paneli')}</h2>
        </header>
        <Card className="text-center py-8 px-4">
          <p className="m-0 font-semibold text-danger">{tr('Не удалось загрузить данные', "Ma'lumotlarni yuklab bo'lmadi")}</p>
          <Button variant="ghost" size="md" type="button" className="mt-3.5" onClick={load}>
            {tr('Повторить', 'Qayta urinish')}
          </Button>
        </Card>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <div className="h-7 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse" />
          <div className="h-3.5 w-3/5 rounded-token-sm bg-neutral-100 animate-pulse mt-2" />
        </div>
        <Card className="bg-neutral-50">
          <div className="h-6 w-[35%] rounded-token-sm bg-neutral-100 animate-pulse" />
          <div className="h-1.5 rounded-full bg-neutral-100 animate-pulse mt-3.5" />
          <div className="flex flex-col gap-2 mt-3.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-11 rounded-token-md bg-neutral-100 animate-pulse" />
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <div className="h-3.5 w-3/5 rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-7 w-1/2 rounded-token-sm bg-neutral-100 animate-pulse mt-2" />
            </Card>
          ))}
        </div>
        <Card>
          <div className="h-6 w-1/4 rounded-token-sm bg-neutral-100 animate-pulse" />
          <div className="h-3.5 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse mt-2" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 py-2.5 border-b border-neutral-100">
              <div className="h-3.5 w-5 rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-3.5 flex-1 rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-3.5 w-[100px] rounded-token-sm bg-neutral-100 animate-pulse" />
            </div>
          ))}
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Дашборд', 'Boshqaruv paneli')}</h2>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Показатели магазина и прогресс настройки', "Do'kon ko'rsatkichlari va sozlash holati")}</p>
      </header>

      {expiryInfo && expiryInfo.daysLeft <= 7 && (
        <Card className={expiryInfo.isExpired ? 'bg-danger/5 border-danger/30' : 'bg-warning/10 border-warning/30'}>
          <p className={`m-0 font-semibold ${expiryInfo.isExpired ? 'text-danger' : 'text-warning'}`}>
            {expiryInfo.isExpired
              ? tr('Подписка истекла. Продлите тариф, чтобы избежать ограничений.', "Obuna muddati tugagan. Cheklovlar bo'lmasligi uchun tarifni uzaytiring.")
              : tr(`Подписка заканчивается через ${expiryInfo.daysLeft} дн. Продлите заранее.`, `Obuna ${expiryInfo.daysLeft} kunda tugaydi. Oldindan uzaytiring.`)}
          </p>
          <p className="mt-1.5 text-token-sm text-neutral-600">
            {tr('Срок:', 'Muddat')}: {expiryInfo.expiresAt.toLocaleDateString()}
          </p>
          <div className="mt-2.5">
            <Button variant="primary" size="md" type="button" onClick={() => navigate('/billing')}>
              {tr('Продлить тариф', 'Tarifni uzaytirish')}
            </Button>
          </div>
        </Card>
      )}

      {completedSteps === totalSteps ? (
        <Card className="bg-success/5 border-success/30 flex items-center gap-3.5">
          <span className="text-token-2xl">🎉</span>
          <div>
            <p className="m-0 font-semibold text-token-lg text-neutral-800">{tr('Магазин полностью настроен', "Do'kon to'liq sozlangan")}</p>
            <p className="mt-1 text-token-sm text-neutral-500">{tr('Все шаги выполнены. Успешных продаж!', 'Barcha qadamlar bajarildi. Muvaffaqiyatli savdo!')}</p>
          </div>
        </Card>
      ) : (
        <Card className="bg-neutral-50">
          {completedSteps <= 1 && (
            <div className="mb-4 px-3.5 py-3 rounded-token-md bg-success/5 border border-success/30">
              <p className="m-0 font-semibold text-token-lg text-success">{tr('Добро пожаловать в SellGram!', "SellGram'ga xush kelibsiz!")}</p>
              <p className="mt-1 text-token-sm text-success">
                {tr('Выполните несколько шагов, чтобы запустить ваш Telegram-магазин.', "Telegram do'koningizni ishga tushirish uchun bir necha qadamni bajaring.")}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Чек-лист запуска', "Ishga tushirish ro'yxati")}</h3>
              <p className="mt-1.5 text-token-sm text-neutral-500">
                {completedSteps} / {totalSteps} {tr('шагов выполнено', 'qadam bajarildi')}
              </p>
            </div>
            <Badge variant="success">
              {Math.round((completedSteps / totalSteps) * 100)}%
            </Badge>
          </div>

          <div className="h-1.5 rounded-full bg-neutral-200 mt-3 overflow-hidden">
            <div
              className="h-full bg-accent-600 transition-all duration-300 ease-out"
              style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-1 gap-2.5 mt-3.5">
            {checks.map((check, i) => (
              <button
                key={`${check.label}-${i}`}
                onClick={() => check.to && navigate(check.to)}
                className={[
                  'border rounded-token-md text-left px-3 py-2.5',
                  check.done ? 'bg-success/5 border-success/30' : 'bg-white border-neutral-200',
                  check.to ? 'cursor-pointer' : 'cursor-default',
                ].join(' ')}
              >
                <div className={`font-semibold text-token-sm ${check.done ? 'text-neutral-500' : 'text-neutral-800'}`}>
                  {check.done ? tr('Готово', 'Bajarildi') : `${tr('Шаг', 'Qadam')} ${i + 1}`}: {check.label}
                </div>
                {!check.done && <div className="text-token-xs text-neutral-500 mt-0.5">{check.desc}</div>}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Заказы сегодня', 'Bugungi buyurtmalar')}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{ordersToday}</div>
        </Card>
        <Card
          className={ordersPending > 0 ? 'bg-warning/10 border-warning/30 cursor-pointer' : ''}
          onClick={() => ordersPending > 0 && navigate('/orders?status=NEW')}
        >
          <div className="text-token-xs text-neutral-500">{tr('Ожидают обработки', 'Kutilmoqda')}</div>
          <div className={`text-token-2xl font-semibold mt-1.5 ${ordersPending > 0 ? 'text-warning' : 'text-neutral-800'}`}>{ordersPending}</div>
        </Card>
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Выручка сегодня', 'Bugungi tushum')}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{Number(revenueToday || 0).toLocaleString()} UZS</div>
        </Card>
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Выручка (месяц)', 'Tushum (oy)')}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{Number(revenueMonth || 0).toLocaleString()} UZS</div>
        </Card>
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Средний чек', "O'rtacha chek")}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{Number(avgCheck || 0).toLocaleString()} UZS</div>
        </Card>
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Клиентов (неделя)', 'Mijozlar (hafta)')}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{newCustomersWeek}</div>
        </Card>
        <Card>
          <div className="text-token-xs text-neutral-500">{tr('Товары', 'Mahsulotlar')}</div>
          <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5">{totalProducts}</div>
        </Card>
        <Card className={reviewCount > 0 ? 'cursor-pointer' : ''} onClick={() => reviewCount > 0 && navigate('/reviews')}>
          <div className="text-token-xs text-neutral-500">{tr('Рейтинг', 'Reyting')}</div>
          {reviewAvg !== null ? (
            <>
              <div className="text-token-2xl font-semibold text-neutral-800 mt-1.5 flex items-baseline gap-1.5">
                {reviewAvg}
                <span className="text-token-lg text-warning">★</span>
              </div>
              <div className="text-token-xs text-neutral-400 mt-0.5">
                {reviewCount} {tr('отзывов', 'sharh')}
              </div>
            </>
          ) : (
            <div className="text-token-2xl font-semibold text-neutral-300 mt-1.5">—</div>
          )}
        </Card>
      </div>

      {recentOrders.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Новые заказы', 'Yangi buyurtmalar')}</h3>
            <Button variant="ghost" size="sm" type="button" onClick={() => navigate('/orders')}>
              {tr('Все заказы →', 'Barcha buyurtmalar →')}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {recentOrders.map((order: any) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-token-md bg-neutral-50 border border-neutral-200 cursor-pointer"
                onClick={() => navigate('/orders')}
              >
                <div>
                  <div className="font-semibold text-token-sm text-neutral-800">
                    {tr('Заказ', 'Buyurtma')} #{order.orderNumber}
                    {order.customer?.firstName ? ` · ${order.customer.firstName}` : ''}
                  </div>
                  <div className="text-token-xs text-neutral-500 mt-0.5">
                    {order.items?.map((i: any) => `${i.name} x${i.qty}`).join(', ')}
                  </div>
                </div>
                <div className="font-semibold text-success text-token-base whitespace-nowrap">
                  {Number(order.total).toLocaleString()} UZS
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {stats?.revenueByDay?.some((d: any) => d.revenue > 0) && (
        <Card>
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Выручка за 14 дней', '14 kunlik tushum')}</h3>
          <p className="mt-1 mb-3 text-token-sm text-neutral-500">
            {tr('Завершённые и доставленные заказы', 'Yakunlangan va yetkazilgan buyurtmalar')}
          </p>
          <RevenueChart data={stats.revenueByDay} />
        </Card>
      )}

      <Card>
        <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Топ товаров', 'Top mahsulotlar')}</h3>
        <p className="mt-1 mb-2.5 text-token-sm text-neutral-500">{tr('Лидеры продаж по выручке', "Tushum bo'yicha eng yaxshi mahsulotlar")}</p>

        {topProducts.length === 0 ? (
          <p className="text-token-sm text-neutral-500">{tr('Данных пока нет', "Hozircha ma'lumot yo'q")}</p>
        ) : (
          <Table
            columns={topProductsColumns}
            data={rankedTopProducts}
            rowKey={(row) => `${row.id || row.name || row.productName}-${row.__index}`}
          />
        )}
      </Card>
    </section>
  );
}
