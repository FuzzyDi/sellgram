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

  const statusMap = useMemo(
    () =>
      ({
        PENDING: { label: tr('Pending payment', "To'lov kutilmoqda"), color: '#f59e0b' },
        PAID: { label: tr('Paid', "To'langan"), color: '#34c759' },
        CANCELLED: { label: tr('Rejected', 'Rad etilgan'), color: '#ef4444' },
        EXPIRED: { label: tr('Expired', 'Muddati tugagan'), color: '#6b7280' },
      }) as Record<string, { label: string; color: string }>,
    [tr]
  );

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3200);
  }

  const load = useCallback(async () => {
    const [s, p, inv] = await Promise.all([
      adminApi.getSubscription().catch(() => null),
      adminApi.getPlans().catch(() => null),
      adminApi.getInvoices().catch(() => []),
    ]);
    setSub(s);
    setPlans(p);
    setInvoices(Array.isArray(inv) ? inv : []);
    setLoading(false);
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

  const getLimits = (plan: any, isCurrent: boolean) => {
    const currentPlanLimits = isCurrent ? sub?.planDetails?.limits : null;
    const limits = { ...(currentPlanLimits || {}), ...(plan?.limits || plan || {}) };
    return {
      maxStores: limits.maxStores ?? limits.stores ?? limits.storeLimit ?? null,
      maxProducts: limits.maxProducts ?? limits.products ?? limits.productLimit ?? null,
      maxOrdersPerMonth: limits.maxOrdersPerMonth ?? limits.ordersPerMonth ?? limits.orderLimit ?? null,
      maxDeliveryZones: limits.maxDeliveryZones ?? limits.deliveryZones ?? limits.zoneLimit ?? null,
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

  const handleUpgrade = async (plan: string) => {
    setSubmitting(true);
    try {
      const result = await adminApi.upgradePlan(plan);
      if (result.invoice) {
        setShowInvoice(result);
        setPaymentRef('');
      } else {
        await load();
      }
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
    }
    setSubmitting(false);
  };

  const submitPayment = async () => {
    if (!paymentRef.trim() || !showInvoice?.invoice?.id) return;
    setSubmitting(true);
    try {
      await adminApi.submitInvoicePayment(showInvoice.invoice.id, paymentRef.trim());
      showNotice('success', tr('Payment details submitted. Await moderation.', "To'lov ma'lumotlari yuborildi. Tasdiq kutilmoqda."));
      setShowInvoice(null);
      await load();
    } catch (err: any) {
      showNotice('error', err?.message || tr('\u041E\u0448\u0438\u0431\u043A\u0430', 'Xatolik')); 
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

  if (loading) return <section className="sg-page"><p className="sg-subtitle">{tr('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...', 'Yuklanmoqda...')}</p></section>;
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
              {tr('Срок:', 'Muddat')}: {expiryInfo.expiresAt.toLocaleDateString(locale)}
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
              const limits = getLimits(plan, isCurrent);
              const price = Number(plan?.price ?? plan?.priceMonthly ?? 0);
              return (
                <div key={code} className="sg-card" style={{ borderColor: isCurrent ? planColors[code] : '#dfe7e2' }}>
                  <div style={{ fontSize: 13, color: '#607167' }}>{planLabel(code)}</div>
                  <div style={{ fontSize: 34, fontWeight: 900, marginTop: 4, color: planColors[code] }}>{price > 0 ? price.toLocaleString() : 0}</div>
                  <div style={{ marginTop: 2, fontSize: 13, color: '#607167' }}>{price > 0 ? tr('UZS / month', "so'm / oy") : tr('Free', 'Bepul')}</div>

                  <ul style={{ marginTop: 10, paddingLeft: 16, color: '#4f5f56', fontSize: 13 }}>
                    {[
                      `${tr('Stores', "Do'konlar")}: ${limits.maxStores === -1 ? tr('без лимита', 'cheklanmagan') : limits.maxStores ?? '-'}`,
                      `${tr('Products', 'Mahsulotlar')}: ${limits.maxProducts === -1 ? tr('без лимита', 'cheklanmagan') : limits.maxProducts ?? '-'}`,
                      `${tr('Orders / month', 'Buyurtma / oy')}: ${limits.maxOrdersPerMonth === -1 ? tr('без лимита', 'cheklanmagan') : limits.maxOrdersPerMonth ?? '-'}`,
                      `${tr('Delivery zones', 'Hududlar')}: ${limits.maxDeliveryZones === -1 ? tr('без лимита', 'cheklanmagan') : limits.maxDeliveryZones ?? '-'}`,
                    ].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>

                  <div style={{ marginTop: 12 }}>
                    {isCurrent ? (
                      <div className="sg-badge" style={{ background: '#eef8f1', color: '#0b6f49' }}>{tr('Текущий', 'Joriy')}</div>
                    ) : (
                      <Button onClick={() => handleUpgrade(code)} disabled={submitting} className="sg-btn primary" style={{ width: '100%' }}>
                        {price === 0 ? tr('Переключить', "O'tish") : tr('Перейти', 'Yangilash')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      <section className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('История счетов', 'Hisoblar tarixi')}</h3>
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
      </section>

      {showInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11, 20, 16, 0.5)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
          <div className="sg-card" style={{ width: '100%', maxWidth: 520 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('Оплата тарифа', "Tarif to'lovi")} {planLabel(showInvoice.invoice.plan)}</h3>
            <p className="sg-subtitle">{tr('Переведите оплату и укажите номер транзакции', "To'lovni o'tkazing va tranzaksiya raqamini kiriting")}</p>

            <div className="sg-card soft" style={{ marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 13 }}><b>{tr('Bank', 'Bank')}:</b> {showInvoice.bankDetails.bank}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}><b>{tr('Account', 'Hisob')}:</b> {showInvoice.bankDetails.account}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}><b>{tr('Recipient', 'Qabul qiluvchi')}:</b> {showInvoice.bankDetails.recipient}</p>
            </div>

            <label style={{ display: 'grid', gap: 4, marginTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#516057' }}>{tr('Transaction / receipt number', 'Tranzaksiya / chek raqami')}</span>
              <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </label>

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button onClick={submitPayment} disabled={submitting || !paymentRef.trim()} className="sg-btn primary" style={{ flex: 1 }}>
                {submitting ? '...' : tr('Submit', 'Yuborish')}
              </button>
              <Button onClick={() => setShowInvoice(null)} className="sg-btn ghost" style={{ flex: 1 }}>
                {tr('Later', 'Keyinroq')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}