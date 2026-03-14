import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

export default function Dashboard() {
  const { tr } = useAdminI18n();
  const [stats, setStats] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getDashboard(), adminApi.getTopProducts(), adminApi.getSubscription().catch(() => null)])
      .then(([s, tp, subscription]) => {
        setStats(s);
        setTopProducts(Array.isArray(tp) ? tp : tp?.items || tp?.data || []);
        setSub(subscription);
      })
      .finally(() => setLoading(false));
  }, []);

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
  const revenueMonth = stats?.revenue?.month ?? stats?.revenueMonth ?? 0;
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
    return normalized || `${tr('\u0422\u043E\u0432\u0430\u0440', 'Mahsulot')} #${index + 1}`;
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

  if (loading) {
    return (
      <section className="sg-page">
        <p className="sg-subtitle">{tr('Загрузка...', 'Yuklanmoqda...')}</p>
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 18 }}>
      <header>
        <h2 className="sg-title">{tr('Дашборд', 'Boshqaruv paneli')}</h2>
        <p className="sg-subtitle">{tr('Показатели магазина и прогресс настройки', "Do'kon ko'rsatkichlari va sozlash holati")}</p>
      </header>

      {expiryInfo && expiryInfo.daysLeft <= 7 && (
        <div
          className="sg-card"
          style={{
            borderColor: expiryInfo.isExpired ? '#fecaca' : '#fde68a',
            background: expiryInfo.isExpired ? '#fff1f2' : '#fffbeb',
          }}
        >
          <p style={{ margin: 0, fontWeight: 800, color: expiryInfo.isExpired ? '#be123c' : '#92400e' }}>
            {expiryInfo.isExpired
              ? tr('Подписка истекла. Продлите тариф, чтобы избежать ограничений.', "Obuna muddati tugagan. Cheklovlar bo'lmasligi uchun tarifni uzaytiring.")
              : tr(`Подписка заканчивается через ${expiryInfo.daysLeft} дн. Продлите заранее.`, `Obuna ${expiryInfo.daysLeft} kunda tugaydi. Oldindan uzaytiring.`)}
          </p>
          <p className="sg-subtitle" style={{ marginTop: 6 }}>
            {tr('Срок:', 'Muddat')}: {expiryInfo.expiresAt.toLocaleDateString()}
          </p>
          <div style={{ marginTop: 10 }}>
            <button className="sg-btn primary" onClick={() => (window.location.hash = '/billing')}>
              {tr('Продлить тариф', 'Tarifni uzaytirish')}
            </button>
          </div>
        </div>
      )}

      <div className="sg-card soft">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Чек-лист запуска', "Ishga tushirish ro'yxati")}</h3>
            <p className="sg-subtitle" style={{ marginTop: 6 }}>
              {completedSteps} / {totalSteps} {tr('шагов выполнено', 'qadam bajarildi')}
            </p>
          </div>
          <div className="sg-badge" style={{ background: '#e8f7ef', color: '#006f4a', fontSize: 12 }}>
            {Math.round((completedSteps / totalSteps) * 100)}%
          </div>
        </div>

        <div style={{ height: 7, borderRadius: 999, background: '#e6efe9', marginTop: 12, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${(completedSteps / totalSteps) * 100}%`,
              background: 'linear-gradient(135deg,#00875a,#00a86f)',
              transition: 'width .35s ease',
            }}
          />
        </div>

        <div className="sg-grid" style={{ marginTop: 14 }}>
          {checks.map((check, i) => (
            <button
              key={`${check.label}-${i}`}
              onClick={() => check.to && (window.location.hash = check.to)}
              style={{
                border: '1px solid #e1e9e3',
                borderRadius: 10,
                background: check.done ? '#f0faf4' : '#fff',
                textAlign: 'left',
                padding: '10px 12px',
                cursor: check.to ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: check.done ? '#5f6d64' : '#18261f' }}>
                {check.done ? tr('Готово', 'Bajarildi') : `${tr('Шаг', 'Qadam')} ${i + 1}`}: {check.label}
              </div>
              {!check.done && <div style={{ color: '#738279', fontSize: 12, marginTop: 2 }}>{check.desc}</div>}
            </button>
          ))}
        </div>
      </div>

      <div className="sg-grid cols-4">
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Заказы сегодня', 'Bugungi buyurtmalar')}</div>
          <div className="sg-kpi-value">{ordersToday}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Выручка (месяц)', 'Tushum (oy)')}</div>
          <div className="sg-kpi-value">{Number(revenueMonth || 0).toLocaleString()} UZS</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Клиенты', 'Mijozlar')}</div>
          <div className="sg-kpi-value">{totalCustomers}</div>
        </article>
        <article className="sg-card">
          <div className="sg-kpi-label">{tr('Товары', 'Mahsulotlar')}</div>
          <div className="sg-kpi-value">{totalProducts}</div>
        </article>
      </div>

      <section className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('Топ товаров', 'Top mahsulotlar')}</h3>
        <p className="sg-subtitle" style={{ marginBottom: 10 }}>{tr('Лидеры продаж по выручке', "Tushum bo'yicha eng yaxshi mahsulotlar")}</p>

        {topProducts.length === 0 ? (
          <p className="sg-subtitle">{tr('Данных пока нет', "Hozircha ma'lumot yo'q")}</p>
        ) : (
          <table className="sg-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{tr('Товар', 'Mahsulot')}</th>
                <th>{tr('Выручка', 'Tushum')}</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.slice(0, 7).map((p: any, i: number) => (
                <tr key={`${p.id || p.name || p.productName}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{resolveProductName(p, i)}</td>
                  <td>{Number(p.totalRevenue || p.revenue || 0).toLocaleString()} UZS</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
