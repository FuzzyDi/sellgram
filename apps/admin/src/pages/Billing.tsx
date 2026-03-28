import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

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
        PENDING: { label: tr('Ожидает оплаты', "To'lov kutilmoqda"), color: '#f59e0b' },
        PAID: { label: tr('Оплачен', "To'langan"), color: '#34c759' },
        CANCELLED: { label: tr('Отклонен', 'Rad etilgan'), color: '#ef4444' },
        EXPIRED: { label: tr('Истек', 'Muddati tugagan'), color: '#6b7280' },
      }) as Record<string, { label: string; color: string }>,
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
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div>
          <div className="sg-skeleton" style={{ height: 28, width: '30%' }} />
          <div className="sg-skeleton" style={{ height: 14, width: '50%', marginTop: 8 }} />
        </div>
        <div className="sg-grid cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="sg-skeleton" style={{ height: 260, borderRadius: 16 }} />
          ))}
        </div>
        <div className="sg-skeleton" style={{ height: 120, borderRadius: 14 }} />
      </section>
    );
  }

  if (loadFailed) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <header>
          <h2 className="sg-title">{tr('Тарифы и оплата', "Tariflar va to'lov")}</h2>
        </header>
        <div className="sg-card" style={{ textAlign: 'center', padding: '40px 16px' }}>
          <p style={{ margin: '0 0 12px', fontWeight: 700, color: '#be123c' }}>
            {tr('Не удалось загрузить данные', "Ma'lumotlarni yuklab bo'lmadi")}
          </p>
          <button className="sg-btn primary" onClick={() => { setLoading(true); void load(); }}>
            {tr('Повторить', 'Qayta urinish')}
          </button>
        </div>
      </section>
    );
  }

  const noticeNode = notice ? (
    <div
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 70,
        minWidth: 280,
        maxWidth: 440,
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 14,
        fontWeight: 700,
        boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
        color: notice.tone === 'error' ? '#991b1b' : notice.tone === 'success' ? '#065f46' : '#1e3a8a',
        background: notice.tone === 'error' ? '#fee2e2' : notice.tone === 'success' ? '#d1fae5' : '#dbeafe',
        border: `1px solid ${notice.tone === 'error' ? '#fecaca' : notice.tone === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
      }}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  ) : null;

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}
      <header>
        <h2 className="sg-title">{tr('Тарифы и оплата', "Tariflar va to'lovlar")}</h2>
        <p className="sg-subtitle">{tr('Лимиты, смена тарифа и история счетов', "Limitlar, tarifni o'zgartirish va hisoblar tarixi")}</p>
      </header>

      <div className="sg-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p className="sg-kpi-label">{tr('Текущий тариф', 'Joriy tarif')}</p>
            <p className="sg-kpi-value" style={{ color: planColors[currentPlan], margin: 0 }}>{planLabel(currentPlan)}</p>
            {sub?.planExpiresAt && (
              <p className="sg-subtitle" style={{ marginTop: 6 }}>
                {tr('Действует до', 'Amal qilish muddati')}: {new Date(sub.planExpiresAt).toLocaleDateString(locale)}
              </p>
            )}
          </div>
        </div>

        {expiryInfo && expiryInfo.daysLeft <= 7 && (
          <div
            style={{
              marginTop: 12,
              border: `1px solid ${expiryInfo.isExpired ? '#fecaca' : '#fde68a'}`,
              background: expiryInfo.isExpired ? '#fff1f2' : '#fffbeb',
              color: expiryInfo.isExpired ? '#be123c' : '#92400e',
              borderRadius: 12,
              padding: '10px 12px',
            }}
          >
            <p style={{ margin: 0, fontWeight: 800 }}>
              {expiryInfo.isExpired
                ? tr('Подписка истекла. Оплатите тариф для продолжения работы.', "Obuna muddati tugagan. Ishlashni davom ettirish uchun tarifni to'lang.")
                : tr(`Подписка закончится через ${expiryInfo.daysLeft} дн.`, `Obuna ${expiryInfo.daysLeft} kunda tugaydi.`)}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              {tr('Срок', 'Muddat')}: {expiryInfo.expiresAt.toLocaleDateString(locale)}
            </p>
          </div>
        )}

        <div className="sg-grid cols-2" style={{ marginTop: 14 }}>
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
              <div key={item.key} className="sg-card soft" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{item.label}</span>
                  <span style={{ fontSize: 13, color: '#64756b' }}>
                    {u.current}/{u.limit === -1 ? tr('без лимита', 'cheklanmagan') : u.limit}
                  </span>
                </div>
                <div style={{ marginTop: 8, height: 6, background: '#dfe8e2', borderRadius: 999 }}>
                  <div style={{ height: '100%', borderRadius: 999, width: u.limit === -1 ? '8%' : `${pct}%`, background: pct >= 80 ? '#ef4444' : '#00875a' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section>
        <h3 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800 }}>{tr('Выберите тариф', 'Tarifni tanlang')}</h3>
        <div className="sg-grid cols-3">
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
              <div
                key={code}
                className="sg-card"
                style={{
                  borderColor: isCurrent ? planColors[code] ?? '#dfe7e2' : isPopular ? '#a78bfa' : '#dfe7e2',
                  borderWidth: isPopular ? 2 : 1,
                  padding: 0,
                  overflow: 'hidden',
                  transition: 'transform 0.18s, box-shadow 0.18s',
                  position: 'relative',
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
                  <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', padding: '5px 16px', textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>
                    {tr('ПОПУЛЯРНЫЙ', 'MASHHUR')}
                  </div>
                )}
                {isCurrent && (
                  <div style={{ background: `${planColors[code]}22`, borderBottom: `2px solid ${planColors[code]}`, padding: '5px 16px', textAlign: 'center', fontSize: 11, fontWeight: 800, color: planColors[code], letterSpacing: 0.5 }}>
                    {tr('ТЕКУЩИЙ ТАРИФ', 'JORIY TARIF')}
                  </div>
                )}

                <div style={{ padding: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: planColors[code] ?? '#607167', textTransform: 'uppercase', letterSpacing: 0.5 }}>{planLabel(code)}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6, color: planColors[code] ?? '#15231a', letterSpacing: -0.5 }}>
                    {price > 0 ? price.toLocaleString() : tr('0', '0')}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 13, color: '#607167' }}>{price > 0 ? `UZS / ${tr('мес', 'oy')}` : tr('бесплатно', 'bepul')}</div>

                  <ul style={{ marginTop: 14, listStyle: 'none', padding: 0, display: 'grid', gap: 6 }}>
                    {features.map((line) => (
                      <li key={line} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#3a4f40', alignItems: 'start' }}>
                        <span style={{ color: planColors[code] ?? '#00875a', fontWeight: 900, flexShrink: 0 }}>✓</span>
                        {line}
                      </li>
                    ))}
                  </ul>

                  <div style={{ marginTop: 16 }}>
                    {isCurrent ? (
                      <div className="sg-badge" style={{ background: `${planColors[code]}1a`, color: planColors[code] ?? '#0b6f49', fontSize: 12 }}>
                        {tr('Активен', 'Faol')}
                      </div>
                    ) : (
                      <Button
                        onClick={() => requestUpgrade(code)}
                        disabled={submitting}
                        className="sg-btn primary"
                        style={{ width: '100%', ...(isPopular ? {} : { background: 'transparent', border: `1px solid ${planColors[code] ?? '#00875a'}`, color: planColors[code] ?? '#00875a' }) }}
                      >
                        {(planRank[code] ?? 0) < (planRank[currentPlan] ?? 0)
                          ? tr('Понизить', 'Kamaytirish')
                          : price === 0 ? tr('Переключить', "O'tish") : tr('Выбрать', 'Tanlash')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('История счетов', 'Hisoblar tarixi')}</h3>
        {invoices.length === 0 ? (
          <p className="sg-subtitle" style={{ marginTop: 10 }}>{tr('Счетов пока нет', "Hozircha hisoblar yo'q")}</p>
        ) : (
          <table className="sg-table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>{tr('Дата', 'Sana')}</th>
                <th>{tr('Тариф', 'Tarif')}</th>
                <th>{tr('Сумма', 'Summa')}</th>
                <th>{tr('Статус', 'Holat')}</th>
                <th>{tr('Транзакция', 'Tranzaksiya')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const st = statusMap[inv.status] || { label: inv.status, color: '#6b7280' };
                return (
                  <tr key={inv.id}>
                    <td>{new Date(inv.createdAt).toLocaleDateString(locale)}</td>
                    <td>{planLabel(inv.plan)}</td>
                    <td>{Number(inv.amount).toLocaleString()} UZS</td>
                    <td>
                      <span className="sg-badge" style={{ background: `${st.color}1a`, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td>{inv.paymentRef || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {pendingDowngrade && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11, 20, 16, 0.5)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
          <div className="sg-card" style={{ width: '100%', maxWidth: 440 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('Понизить тариф?', 'Tarifni kamaytirasizmi?')}</h3>
            <p className="sg-subtitle" style={{ marginTop: 8 }}>
              {tr(
                `Вы переходите с ${planLabel(currentPlan)} на ${planLabel(pendingDowngrade)}. Часть функций станет недоступна.`,
                `${planLabel(currentPlan)} dan ${planLabel(pendingDowngrade)} ga o'tasiz. Ba'zi funksiyalar mavjud bo'lmaydi.`
              )}
            </p>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button onClick={() => doUpgrade(pendingDowngrade)} disabled={submitting} className="sg-btn" style={{ flex: 1, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', fontWeight: 700 }}>
                {submitting ? '...' : tr('Да, понизить', 'Ha, kamaytirish')}
              </button>
              <button onClick={() => setPendingDowngrade(null)} className="sg-btn ghost" style={{ flex: 1 }}>
                {tr('Отмена', 'Bekor qilish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11, 20, 16, 0.5)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16, overflowY: 'auto' }}>
          <div className="sg-card" style={{ width: '100%', maxWidth: 520 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('Оплата тарифа', "Tarif to'lovi")} {planLabel(showInvoice.invoice.plan)}</h3>
            <p className="sg-subtitle">{tr('Выберите способ оплаты и переведите', "To'lov usulini tanlang va o'tkazing")}</p>
            <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              {tr('Сумма', 'Summa')}: {Number(showInvoice.invoice.amount).toLocaleString()} UZS
            </p>

            {/* Payment methods */}
            {(() => {
              const bd = showInvoice.bankDetails || {};
              const methods: any[] = bd.paymentMethods || [{ type: 'bank', ...bd }];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                  {methods.map((m: any, i: number) => {
                    const icons: Record<string, string> = { bank: '🏦', card: '💳', payme: '🔵', click: '🟢' };
                    const titles: Record<string, string> = { bank: tr('Банковский перевод', "Bank o'tkazmasi"), card: tr('Карта', 'Karta'), payme: 'Payme', click: 'Click' };
                    return (
                      <div key={i} className="sg-card soft" style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{icons[m.type] || '💰'} {titles[m.type] || m.type}</div>
                        {m.type === 'bank' && (<>
                          {m.recipient && <p style={{ margin: '2px 0', fontSize: 13 }}><b>{tr('Получатель', 'Qabul qiluvchi')}:</b> {m.recipient}</p>}
                          {m.bank     && <p style={{ margin: '2px 0', fontSize: 13 }}><b>{tr('Банк', 'Bank')}:</b> {m.bank}</p>}
                          {m.account  && <p style={{ margin: '2px 0', fontSize: 13 }}><b>{tr('Счёт', 'Hisob')}:</b> {m.account}</p>}
                          {m.inn      && <p style={{ margin: '2px 0', fontSize: 13 }}><b>ИНН:</b> {m.inn}</p>}
                          {m.mfo      && <p style={{ margin: '2px 0', fontSize: 13 }}><b>МФО:</b> {m.mfo}</p>}
                          {m.note     && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#607167' }}>{m.note}</p>}
                        </>)}
                        {m.type === 'card' && (<>
                          {m.number && <p style={{ margin: '2px 0', fontSize: 15, fontWeight: 800, letterSpacing: 2 }}>{m.number}</p>}
                          {m.holder && <p style={{ margin: '2px 0', fontSize: 13 }}><b>{tr('Владелец', 'Egasi')}:</b> {m.holder}</p>}
                          {m.bank   && <p style={{ margin: '2px 0', fontSize: 13 }}><b>{tr('Банк', 'Bank')}:</b> {m.bank}</p>}
                          {m.note   && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#607167' }}>{m.note}</p>}
                        </>)}
                        {(m.type === 'payme' || m.type === 'click') && (<>
                          {m.merchantId && <p style={{ margin: '2px 0', fontSize: 13 }}><b>Merchant ID:</b> {m.merchantId}</p>}
                          {m.serviceId  && <p style={{ margin: '2px 0', fontSize: 13 }}><b>Service ID:</b> {m.serviceId}</p>}
                          {m.note       && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#607167' }}>{m.note}</p>}
                        </>)}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <label style={{ display: 'grid', gap: 4, marginTop: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#516057' }}>{tr('Номер транзакции / чека', 'Tranzaksiya / chek raqami')}</span>
              <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder={tr('После оплаты введите номер', "To'lovdan keyin raqamni kiriting")} />
            </label>

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button onClick={submitPayment} disabled={submitting || !paymentRef.trim()} className="sg-btn primary" style={{ flex: 1 }}>
                {submitting ? '...' : tr('Отправить', 'Yuborish')}
              </button>
              <Button onClick={() => setShowInvoice(null)} className="sg-btn ghost" style={{ flex: 1 }}>
                {tr('Позже', 'Keyinroq')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
