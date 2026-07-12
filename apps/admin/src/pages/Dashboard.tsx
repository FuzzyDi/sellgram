import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';
import MultiChannelChart from './dashboard/MultiChannelChart';

export default function Dashboard() {
  const { tr, locale } = useAdminI18n();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    Promise.all([
      adminApi.getDashboard(),
      adminApi.getSubscription().catch(() => null),
    ])
      .then(([s, subscription]) => {
        setStats(s);
        setSub(subscription);
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
  const onboardingDone = completedSteps === totalSteps;

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

  const summary = stats?.summary ?? {};
  const sellgram = stats?.sellgram ?? {};
  const pos = stats?.pos ?? {};
  const b2b = stats?.b2b ?? {};
  const revenueChart = stats?.revenueChart ?? [];
  const topProducts = stats?.topProducts ?? [];
  const posStatus = stats?.posStatus ?? [];

  const topProductsColumns: TableColumn<any>[] = [
    { key: 'name', header: tr('Товар', 'Mahsulot'), render: (row) => row.name },
    { key: 'qty', header: tr('Кол-во', 'Soni'), align: 'right', render: (row) => Number(row.qty || 0).toLocaleString('ru-RU') },
    { key: 'amount', header: tr('Выручка', 'Tushum'), align: 'right', render: (row) => `${Number(row.amount || 0).toLocaleString('ru-RU')} UZS` },
  ];

  const posStatusColumns: TableColumn<any>[] = [
    { key: 'name', header: tr('Устройство', 'Qurilma'), render: (row) => row.name },
    {
      key: 'online',
      header: tr('Статус', 'Holat'),
      render: (row) => (row.online ? <Badge variant="success">Online</Badge> : <Badge variant="neutral">Offline</Badge>),
    },
    {
      key: 'lastSeenAt',
      header: tr('Последний heartbeat', 'Oxirgi heartbeat'),
      render: (row) => (row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString(locale) : '—'),
    },
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <div className="h-4 w-2/5 rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="flex flex-col gap-2 mt-3">
                {[1, 2, 3].map((j) => <div key={j} className="h-3.5 rounded-token-sm bg-neutral-100 animate-pulse" />)}
              </div>
            </Card>
          ))}
        </div>
        <Card>
          <div className="h-40 rounded-token-md bg-neutral-100 animate-pulse" />
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Дашборд', 'Boshqaruv paneli')}</h2>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Обзор всех каналов продаж SBGCloud', 'SBGCloud barcha savdo kanallari sharhi')}</p>
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

      {/* Onboarding checklist — hidden entirely once every step is done,
          not replaced with a "все готово" celebration card. */}
      {!onboardingDone && (
        <Card className="bg-neutral-50">
          {completedSteps <= 1 && (
            <div className="mb-4 px-3.5 py-3 rounded-token-md bg-success/5 border border-success/30">
              <p className="m-0 font-semibold text-token-lg text-success">{tr('Добро пожаловать в SBGCloud!', "SBGCloud'ga xush kelibsiz!")}</p>
              <p className="mt-1 text-token-sm text-success">
                {tr('Выполните несколько шагов, чтобы запустить ваш магазин.', "Do'koningizni ishga tushirish uchun bir necha qadamni bajaring.")}
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

      {/* Three channel cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-t-2" style={{ borderTopColor: '#059669' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-channel-sellgram" aria-hidden="true" />
            <h3 className="m-0 text-token-base font-semibold text-neutral-800">Sellgram</h3>
          </div>
          <div className="flex flex-col gap-1.5 text-token-sm">
            <div className="flex justify-between"><span className="text-neutral-500">{tr('Заказы сегодня', 'Bugungi buyurtmalar')}</span><span className="font-semibold text-neutral-800">{sellgram.ordersToday ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">{tr('Ожидают', 'Kutilmoqda')}</span><span className={`font-semibold ${(sellgram.ordersPending ?? 0) > 0 ? 'text-warning' : 'text-neutral-800'}`}>{sellgram.ordersPending ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">{tr('Выручка месяца', 'Oylik tushum')}</span><span className="font-semibold text-neutral-800">{Number(sellgram.revenueMonth || 0).toLocaleString('ru-RU')} UZS</span></div>
          </div>
          <Button variant="ghost" size="sm" type="button" className="mt-3 w-full" onClick={() => navigate('/orders')}>
            {tr('Перейти к заказам →', 'Buyurtmalarga o\'tish →')}
          </Button>
        </Card>

        <Card className="border-t-2" style={{ borderTopColor: '#0284c7' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-channel-pos" aria-hidden="true" />
            <h3 className="m-0 text-token-base font-semibold text-neutral-800">POS</h3>
          </div>
          <div className="flex flex-col gap-1.5 text-token-sm">
            <div className="flex justify-between"><span className="text-neutral-500">{tr('Касс онлайн', 'Kassalar onlayn')}</span><span className="font-semibold text-neutral-800">{pos.devicesOnline ?? 0} / {pos.devicesTotal ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">{tr('Смен сегодня', 'Bugungi smenalar')}</span><span className="font-semibold text-neutral-800">{pos.shiftsToday ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">{tr('Выручка сегодня', 'Bugungi tushum')}</span><span className="font-semibold text-neutral-800">{Number(pos.revenueToday || 0).toLocaleString('ru-RU')} UZS</span></div>
          </div>
          <Button variant="ghost" size="sm" type="button" className="mt-3 w-full" onClick={() => navigate('/pos/devices')}>
            {tr('Перейти к кассам →', 'Kassalarga o\'tish →')}
          </Button>
        </Card>

        <Card className="border-t-2" style={{ borderTopColor: '#7c3aed' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-channel-b2b" aria-hidden="true" />
            <h3 className="m-0 text-token-base font-semibold text-neutral-800">B2B</h3>
          </div>
          <div className="flex flex-col gap-1.5 text-token-sm">
            <div className="flex justify-between"><span className="text-neutral-500">{tr('Активных контрагентов', 'Faol kontragentlar')}</span><span className="font-semibold text-neutral-800">{b2b.counterpartiesActive ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">{tr('Общий долг', 'Umumiy qarz')}</span><span className={`font-semibold ${(b2b.totalDebt ?? 0) > 0 ? 'text-danger' : 'text-neutral-800'}`}>{Number(b2b.totalDebt || 0).toLocaleString('ru-RU')} UZS</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">{tr('Заказов в месяц', 'Oylik buyurtmalar')}</span><span className="font-semibold text-neutral-800">{b2b.ordersMonth ?? 0}</span></div>
          </div>
          <Button variant="ghost" size="sm" type="button" className="mt-3 w-full" onClick={() => navigate('/b2b/counterparties')}>
            {tr('Перейти к контрагентам →', "Kontragentlarga o'tish →")}
          </Button>
        </Card>
      </div>

      {/* Multi-channel revenue chart */}
      {revenueChart.some((d: any) => d.sellgram > 0 || d.pos > 0 || d.b2b > 0) && (
        <Card>
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Выручка за 14 дней', '14 kunlik tushum')}</h3>
          <p className="mt-1 mb-3 text-token-sm text-neutral-500">
            {tr('По всем каналам продаж', 'Barcha savdo kanallari bo\'yicha')}
          </p>
          <MultiChannelChart data={revenueChart} />
        </Card>
      )}

      {/* Bottom: top products + POS status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Топ товаров', 'Top mahsulotlar')}</h3>
          <p className="mt-1 mb-2.5 text-token-sm text-neutral-500">{tr('По всем каналам', 'Barcha kanallar bo\'yicha')}</p>
          {topProducts.length === 0 ? (
            <p className="text-token-sm text-neutral-500">{tr('Данных пока нет', "Hozircha ma'lumot yo'q")}</p>
          ) : (
            <Table columns={topProductsColumns} data={topProducts} rowKey={(row) => row.name} />
          )}
        </Card>

        <Card>
          <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Статус касс', 'Kassalar holati')}</h3>
          <p className="mt-1 mb-2.5 text-token-sm text-neutral-500">{tr('Активные POS-устройства', 'Faol POS qurilmalari')}</p>
          {posStatus.length === 0 ? (
            <p className="text-token-sm text-neutral-500">{tr('Устройств пока нет', "Hali qurilmalar yo'q")}</p>
          ) : (
            <Table columns={posStatusColumns} data={posStatus} rowKey={(row) => row.name} />
          )}
        </Card>
      </div>
    </section>
  );
}
