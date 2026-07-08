import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge, { type BadgeVariant } from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';
import { useAdminI18n } from '../i18n';
import InvoicePayModal from './billing/InvoicePayModal';

type NoticeTone = 'success' | 'error' | 'info';

const planColors: Record<string, string> = {
  FREE: '#6b7280',
  PRO: '#00875a',
  BUSINESS: '#7c3aed',
};

const planRank: Record<string, number> = { FREE: 0, PRO: 1, BUSINESS: 2 };

const planLimitFallbacks: Record<
  string,
  { maxStores: number; maxProducts: number; maxOrdersPerMonth: number; maxDeliveryZones: number }
> = {
  FREE: { maxStores: 1, maxProducts: 30, maxOrdersPerMonth: 100, maxDeliveryZones: 2 },
  PRO: { maxStores: 3, maxProducts: 500, maxOrdersPerMonth: 1000, maxDeliveryZones: 10 },
  BUSINESS: { maxStores: 10, maxProducts: -1, maxOrdersPerMonth: -1, maxDeliveryZones: -1 },
};

const invoiceStatusVariant: Record<string, BadgeVariant> = {
  PENDING: 'warning',
  PAID: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'neutral',
};

export default function Billing() {
  const { tr, locale } = useAdminI18n();
  const [sub, setSub] = useState<any>(null);
  const [plans, setPlans] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvoice, setShowInvoice] = useState<any>(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [pendingDowngrade, setPendingDowngrade] = useState<string | null>(null);

  const statusMap = useMemo(
    () =>
      ({
        PENDING: { label: tr('Ожидает оплаты', "To'lov kutilmoqda") },
        PAID: { label: tr('Оплачен', "To'langan") },
        CANCELLED: { label: tr('Отклонен', 'Rad etilgan') },
        EXPIRED: { label: tr('Истек', 'Muddati tugagan') },
      }) as Record<string, { label: string }>,
    [tr]
  );

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [s, p, inv] = await Promise.all([
        adminApi.getSubscription().catch(() => null),
        adminApi.getPlans(),
        adminApi.getInvoices().catch(() => []),
      ]);
      setSub(s);
      setPlans(p);
      setInvoices(Array.isArray(inv) ? inv : []);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const planLabel = (code: string) => {
    if (code === 'FREE') return tr('Бесплатный', 'Bepul');
    if (code === 'PRO') return tr('Про', 'Pro');
    if (code === 'BUSINESS') return tr('Бизнес', 'Biznes');
    return code;
  };

  const reportLevelLabel = (level?: string) => {
    if (level === 'FULL') return tr('Все отчеты', 'Barcha hisobotlar');
    if (level === 'ADVANCED') return tr('Базовые + расширенные', 'Oddiy + kengaytirilgan');
    return tr('Базовые', 'Oddiy');
  };

  const getLimits = (code: string, plan: any, isCurrent: boolean) => {
    const currentPlanLimits = isCurrent ? sub?.planDetails?.limits : null;
    const fallback = planLimitFallbacks[code] || null;
    const limits = { ...(fallback || {}), ...(currentPlanLimits || {}), ...(plan?.limits || plan || {}) };

    return {
      maxStores: limits.maxStores ?? limits.stores ?? limits.storeLimit ?? fallback?.maxStores ?? null,
      maxProducts: limits.maxProducts ?? limits.products ?? limits.productLimit ?? fallback?.maxProducts ?? null,
      maxOrdersPerMonth:
        limits.maxOrdersPerMonth ?? limits.ordersPerMonth ?? limits.orderLimit ?? fallback?.maxOrdersPerMonth ?? null,
      maxDeliveryZones:
        limits.maxDeliveryZones ?? limits.deliveryZones ?? limits.zoneLimit ?? fallback?.maxDeliveryZones ?? null,
    };
  };

  const planEntries = useMemo<[string, any][]>(() => {
    const source = plans?.plans ?? plans?.items ?? plans;
    if (Array.isArray(source)) {
      return source
        .map((item: any) => [item?.code || item?.plan || item?.id, item] as [string, any])
        .filter(([code]) => Boolean(code));
    }
    if (source && typeof source === 'object') {
      return Object.entries(source);
    }
    return [];
  }, [plans]);

  const requestUpgrade = (plan: string) => {
    const isDowngrade = (planRank[plan] ?? 0) < (planRank[currentPlan] ?? 0);
    if (isDowngrade) {
      setPendingDowngrade(plan);
      return;
    }
    void doUpgrade(plan);
  };

  const doUpgrade = async (plan: string) => {
    setPendingDowngrade(null);
    setSubmitting(true);
    try {
      const result = await adminApi.upgradePlan(plan);
      if (result.invoice) {
        setShowInvoice(result);
        setPaymentRef('');
      } else {
        await load();
        showNotice('success', tr('Тариф изменён', 'Tarif o\'zgartirildi'));
      }
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
    setSubmitting(false);
  };

  const submitPayment = async () => {
    if (!paymentRef.trim() || !showInvoice?.invoice?.id) return;
    setSubmitting(true);
    try {
      await adminApi.submitInvoicePayment(showInvoice.invoice.id, paymentRef.trim());
      showNotice('success', tr('Данные оплаты отправлены. Ожидайте модерации.', "To'lov ma'lumotlari yuborildi. Tasdiq kutilmoqda."));
      setShowInvoice(null);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
    setSubmitting(false);
  };

  const currentPlan = sub?.plan || 'FREE';
  const usage = sub?.usage || {};
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
      <section className="flex flex-col gap-4">
        <div>
          <div className="h-7 w-[30%] rounded-token-sm bg-neutral-100 animate-pulse" />
          <div className="h-3.5 w-1/2 rounded-token-sm bg-neutral-100 animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[260px] rounded-token-lg bg-neutral-100 animate-pulse" />
          ))}
        </div>
        <div className="h-[120px] rounded-token-lg bg-neutral-100 animate-pulse" />
      </section>
    );
  }

  if (loadFailed) {
    return (
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Тарифы и оплата', "Tariflar va to'lov")}</h2>
        </header>
        <Card className="text-center py-10 px-4">
          <p className="m-0 mb-3 font-semibold text-danger">
            {tr('Не удалось загрузить данные', "Ma'lumotlarni yuklab bo'lmadi")}
          </p>
          <Button variant="primary" size="md" onClick={() => { setLoading(true); void load(); }}>
            {tr('Повторить', 'Qayta urinish')}
          </Button>
        </Card>
      </section>
    );
  }

  const noticeNode = notice ? (
    <div
      className={[
        'fixed top-[18px] right-[18px] z-[70] min-w-[280px] max-w-[440px] rounded-token-lg px-3.5 py-3 text-token-sm font-semibold shadow-sm border',
        notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30'
          : notice.tone === 'success' ? 'bg-success/10 text-success border-success/30'
          : 'bg-accent-600/10 text-accent-600 border-accent-600/30',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  const invoiceColumns: TableColumn<any>[] = [
    { key: 'date', header: tr('Дата', 'Sana'), render: (inv) => new Date(inv.createdAt).toLocaleDateString(locale) },
    { key: 'plan', header: tr('Тариф', 'Tarif'), render: (inv) => planLabel(inv.plan) },
    { key: 'amount', header: tr('Сумма', 'Summa'), render: (inv) => `${Number(inv.amount).toLocaleString()} UZS` },
    {
      key: 'status',
      header: tr('Статус', 'Holat'),
      render: (inv) => {
        const st = statusMap[inv.status] || { label: inv.status };
        return <Badge variant={invoiceStatusVariant[inv.status] ?? 'neutral'}>{st.label}</Badge>;
      },
    },
    { key: 'ref', header: tr('Транзакция', 'Tranzaksiya'), render: (inv) => inv.paymentRef || '-' },
  ];

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}
      <header>
        <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Тарифы и оплата', "Tariflar va to'lovlar")}</h2>
        <p className="mt-1 text-token-sm text-neutral-500">{tr('Лимиты, смена тарифа и история счетов', "Limitlar, tarifni o'zgartirish va hisoblar tarixi")}</p>
      </header>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-token-sm text-neutral-500">{tr('Текущий тариф', 'Joriy tarif')}</p>
            <p className="m-0 mt-1.5 text-token-2xl font-semibold" style={{ color: planColors[currentPlan] }}>{planLabel(currentPlan)}</p>
            {sub?.planExpiresAt && (
              <p className="mt-1.5 text-token-sm text-neutral-500">
                {tr('Действует до', 'Amal qilish muddati')}: {new Date(sub.planExpiresAt).toLocaleDateString(locale)}
              </p>
            )}
          </div>
        </div>

        {expiryInfo && expiryInfo.daysLeft <= 7 && (
          <div
            className={[
              'mt-3 rounded-token-md px-3 py-2.5 border',
              expiryInfo.isExpired ? 'bg-danger/5 border-danger/30 text-danger' : 'bg-warning/5 border-warning/30 text-warning',
            ].join(' ')}
          >
            <p className="m-0 font-semibold text-token-sm">
              {expiryInfo.isExpired
                ? tr('Подписка истекла. Оплатите тариф для продолжения работы.', "Obuna muddati tugagan. Ishlashni davom ettirish uchun tarifni to'lang.")
                : tr(`Подписка закончится через ${expiryInfo.daysLeft} дн.`, `Obuna ${expiryInfo.daysLeft} kunda tugaydi.`)}
            </p>
            <p className="mt-1.5 mb-0 text-token-sm">
              {tr('Срок', 'Muddat')}: {expiryInfo.expiresAt.toLocaleDateString(locale)}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3.5">
          {[
            { key: 'stores', label: tr('Stores', "Do'konlar") },
            { key: 'products', label: tr('Products', 'Mahsulotlar') },
            { key: 'ordersThisMonth', label: tr('Orders (month)', 'Buyurtmalar (oy)') },
            { key: 'deliveryZones', label: tr('Delivery zones', 'Hududlar') },
          ].map((item) => {
            const u = usage[item.key];
            if (!u) return null;
            const pct = u.limit === -1 ? 0 : Math.min(100, (u.current / u.limit) * 100);
            return (
              <Card key={item.key} className="bg-neutral-50 p-3">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-token-sm text-neutral-800">{item.label}</span>
                  <span className="text-token-sm text-neutral-500">
                    {u.current}/{u.limit === -1 ? tr('без лимита', 'cheklanmagan') : u.limit}
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-neutral-200 rounded-full">
                  <div
                    className={['h-full rounded-full', pct >= 80 ? 'bg-danger' : 'bg-success'].join(' ')}
                    style={{ width: u.limit === -1 ? '8%' : `${pct}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </Card>

      <section>
        <h3 className="m-0 mb-2.5 text-token-xl font-semibold text-neutral-800">{tr('Выберите тариф', 'Tarifni tanlang')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {planEntries.map(([code, plan]: [string, any]) => {
            const isCurrent = code === currentPlan;
            const limits = getLimits(code, plan, isCurrent);
            const planLimits = plan?.limits || {};
            const reportsLevel = planLimits.reportsLevel || (code === 'BUSINESS' ? 'FULL' : code === 'PRO' ? 'ADVANCED' : 'BASIC');
            const reportsHistoryDays = Number(planLimits.reportsHistoryDays ?? (code === 'BUSINESS' ? 365 : code === 'PRO' ? 90 : 14));
            const allowReportExport = Boolean(planLimits.allowReportExport ?? (code !== 'FREE'));
            const maxScheduledReports = Number(planLimits.maxScheduledReports ?? (code === 'BUSINESS' ? -1 : code === 'PRO' ? 3 : 0));
            const price = Number(plan?.price ?? plan?.priceMonthly ?? 0);

            const features = [
              `${tr('Stores', "Do'konlar")}: ${limits.maxStores === -1 ? tr('без лимита', 'cheklanmagan') : limits.maxStores ?? '-'}`,
              `${tr('Products', 'Mahsulotlar')}: ${limits.maxProducts === -1 ? tr('без лимита', 'cheklanmagan') : limits.maxProducts ?? '-'}`,
              `${tr('Orders / month', 'Buyurtma / oy')}: ${limits.maxOrdersPerMonth === -1 ? tr('без лимита', 'cheklanmagan') : limits.maxOrdersPerMonth ?? '-'}`,
              `${tr('Delivery zones', 'Hududlar')}: ${limits.maxDeliveryZones === -1 ? tr('без лимита', 'cheklanmagan') : limits.maxDeliveryZones ?? '-'}`,
              `${tr('Reports', 'Hisobotlar')}: ${reportLevelLabel(reportsLevel)}`,
              `${tr('History', 'Tarix')}: ${reportsHistoryDays} ${tr('days', 'kun')}`,
              `${tr('Export', 'Eksport')}: ${allowReportExport ? tr('Да', 'Ha') : tr('Нет', "Yo'q")}`,
              `${tr('Scheduled reports', 'Avto-hisobotlar')}: ${maxScheduledReports === -1 ? tr('без лимита', 'cheklanmagan') : maxScheduledReports}`,
            ];

            const isPopular = code === 'PRO';
            return (
              <Card
                key={code}
                className="relative overflow-hidden transition-transform"
                style={{
                  borderColor: isCurrent ? planColors[code] ?? undefined : isPopular ? '#a78bfa' : undefined,
                  borderWidth: isPopular ? 2 : 1,
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 10px 30px rgba(0,0,0,0.10)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = '';
                  (e.currentTarget as HTMLElement).style.boxShadow = '';
                }}
              >
                {/* Top stripe */}
                {isPopular && (
                  <div className="bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] px-4 py-1.5 text-center text-token-xs font-semibold text-white tracking-wide">
                    {tr('ПОПУЛЯРНЫЙ', 'MASHHUR')}
                  </div>
                )}
                {isCurrent && (
                  <div
                    className="px-4 py-1.5 text-center text-token-xs font-semibold tracking-wide border-b-2"
                    style={{ background: `${planColors[code]}22`, borderColor: planColors[code], color: planColors[code] }}
                  >
                    {tr('ТЕКУЩИЙ ТАРИФ', 'JORIY TARIF')}
                  </div>
                )}

                <div className="p-[18px]">
                  <div className="text-token-xs font-semibold uppercase tracking-wide" style={{ color: planColors[code] ?? undefined }}>{planLabel(code)}</div>
                  <div className="text-[32px] font-bold mt-1.5 tracking-tight" style={{ color: planColors[code] ?? undefined }}>
                    {price > 0 ? price.toLocaleString() : tr('0', '0')}
                  </div>
                  <div className="mt-0.5 text-token-sm text-neutral-500">{price > 0 ? `UZS / ${tr('мес', 'oy')}` : tr('бесплатно', 'bepul')}</div>

                  <ul className="mt-3.5 list-none p-0 flex flex-col gap-1.5">
                    {features.map((line) => (
                      <li key={line} className="flex gap-2 text-token-sm text-neutral-700 items-start">
                        <span className="font-bold flex-shrink-0" style={{ color: planColors[code] ?? undefined }}>✓</span>
                        {line}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4">
                    {isCurrent ? (
                      <Badge variant="success">
                        {tr('Активен', 'Faol')}
                      </Badge>
                    ) : (
                      <Button
                        onClick={() => requestUpgrade(code)}
                        disabled={submitting}
                        variant={isPopular ? 'primary' : undefined}
                        size={isPopular ? 'md' : undefined}
                        className={isPopular ? 'w-full' : 'w-full rounded-token-md px-3.5 py-2 text-token-sm font-semibold bg-transparent'}
                        style={isPopular ? undefined : { border: `1px solid ${planColors[code] ?? '#00875a'}`, color: planColors[code] ?? '#00875a' }}
                      >
                        {(planRank[code] ?? 0) < (planRank[currentPlan] ?? 0)
                          ? tr('Понизить', 'Kamaytirish')
                          : price === 0 ? tr('Переключить', "O'tish") : tr('Выбрать', 'Tanlash')}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <Card>
        <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('История счетов', 'Hisoblar tarixi')}</h3>
        {invoices.length === 0 ? (
          <p className="mt-2.5 text-token-sm text-neutral-500">{tr('Счетов пока нет', "Hozircha hisoblar yo'q")}</p>
        ) : (
          <div className="mt-2.5">
            <Table columns={invoiceColumns} data={invoices} rowKey={(inv) => inv.id} />
          </div>
        )}
      </Card>

      {pendingDowngrade && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-[440px]">
            <h3 className="m-0 text-token-lg font-semibold text-neutral-800">{tr('Понизить тариф?', 'Tarifni kamaytirasizmi?')}</h3>
            <p className="mt-2 text-token-sm text-neutral-500">
              {tr(
                `Вы переходите с ${planLabel(currentPlan)} на ${planLabel(pendingDowngrade)}. Часть функций станет недоступна.`,
                `${planLabel(currentPlan)} dan ${planLabel(pendingDowngrade)} ga o'tasiz. Ba'zi funksiyalar mavjud bo'lmaydi.`
              )}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="danger" size="md" onClick={() => doUpgrade(pendingDowngrade)} disabled={submitting} className="flex-1">
                {submitting ? '...' : tr('Да, понизить', 'Ha, kamaytirish')}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setPendingDowngrade(null)} className="flex-1">
                {tr('Отмена', 'Bekor qilish')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showInvoice && (
        <InvoicePayModal
          invoice={showInvoice.invoice}
          bankDetails={showInvoice.bankDetails}
          tr={tr}
          submitting={submitting}
          setSubmitting={setSubmitting}
          paymentRef={paymentRef}
          setPaymentRef={setPaymentRef}
          onSubmit={submitPayment}
          onClose={() => setShowInvoice(null)}
          showNotice={showNotice}
        />
      )}
    </section>
  );
}
