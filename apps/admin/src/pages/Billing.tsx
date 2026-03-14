import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

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
      alert(err.message);
    }
    setSubmitting(false);
  };

  const submitPayment = async () => {
    if (!paymentRef.trim() || !showInvoice?.invoice?.id) return;
    setSubmitting(true);
    try {
      await adminApi.submitInvoicePayment(showInvoice.invoice.id, paymentRef.trim());
      alert(tr('Payment details submitted. Await moderation.', "To'lov ma'lumotlari yuborildi. Tasdiq kutilmoqda."));
      setShowInvoice(null);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
    setSubmitting(false);
  };

  if (loading) return <section className="sg-page"><p className="sg-subtitle">{tr('Loading...', 'Yuklanmoqda...')}</p></section>;

  const currentPlan = sub?.plan || 'FREE';
  const usage = sub?.usage || {};

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      <header>
        <h2 className="sg-title">{tr('\u0422\u0430\u0440\u0438\u0444\u044b \u0438 \u043e\u043f\u043b\u0430\u0442\u0430', "Tariflar va to'lovlar")}</h2>
        <p className="sg-subtitle">{tr('\u041b\u0438\u043c\u0438\u0442\u044b, \u0441\u043c\u0435\u043d\u0430 \u0442\u0430\u0440\u0438\u0444\u0430 \u0438 \u0438\u0441\u0442\u043e\u0440\u0438\u044f \u0441\u0447\u0435\u0442\u043e\u0432', "Limitlar, tarifni o'zgartirish va hisoblar tarixi")}</p>
      </header>

      <div className="sg-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p className="sg-kpi-label">{tr('\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0442\u0430\u0440\u0438\u0444', 'Joriy tarif')}</p>
            <p className="sg-kpi-value" style={{ color: planColors[currentPlan], margin: 0 }}>{plans?.[currentPlan]?.name || currentPlan}</p>
            {sub?.planExpiresAt && (
              <p className="sg-subtitle" style={{ marginTop: 6 }}>
                {tr('\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0434\u043e', 'Amal qilish muddati')}: {new Date(sub.planExpiresAt).toLocaleDateString(locale)}
              </p>
            )}
          </div>
        </div>

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
                    {u.current}/{u.limit === -1 ? tr('\u0431\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u0430', 'cheklanmagan') : u.limit}
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
        <h3 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800 }}>{tr('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0430\u0440\u0438\u0444', 'Tarifni tanlang')}</h3>
        <div className="sg-grid cols-3">
          {plans &&
            Object.entries(plans).map(([code, plan]: [string, any]) => {
              const isCurrent = code === currentPlan;
              return (
                <div key={code} className="sg-card" style={{ borderColor: isCurrent ? planColors[code] : '#dfe7e2' }}>
                  <div style={{ fontSize: 13, color: '#607167' }}>{plan.name}</div>
                  <div style={{ fontSize: 34, fontWeight: 900, marginTop: 4, color: planColors[code] }}>{plan.price > 0 ? plan.price.toLocaleString() : 0}</div>
                  <div style={{ marginTop: 2, fontSize: 13, color: '#607167' }}>{plan.price > 0 ? tr('UZS / month', "so'm / oy") : tr('Free', 'Bepul')}</div>

                  <ul style={{ marginTop: 10, paddingLeft: 16, color: '#4f5f56', fontSize: 13 }}>
                    {[
                      `${tr('Stores', "Do'konlar")}: ${plan.limits?.maxStores === -1 ? tr('\u0431\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u0430', 'cheklanmagan') : plan.limits?.maxStores}`,
                      `${tr('Products', 'Mahsulotlar')}: ${plan.limits?.maxProducts === -1 ? tr('\u0431\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u0430', 'cheklanmagan') : plan.limits?.maxProducts}`,
                      `${tr('Orders / month', 'Buyurtma / oy')}: ${plan.limits?.maxOrdersPerMonth === -1 ? tr('\u0431\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u0430', 'cheklanmagan') : plan.limits?.maxOrdersPerMonth}`,
                      `${tr('Delivery zones', 'Hududlar')}: ${plan.limits?.maxDeliveryZones === -1 ? tr('\u0431\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u0430', 'cheklanmagan') : plan.limits?.maxDeliveryZones}`,
                    ].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>

                  <div style={{ marginTop: 12 }}>
                    {isCurrent ? (
                      <div className="sg-badge" style={{ background: '#eef8f1', color: '#0b6f49' }}>{tr('\u0422\u0435\u043a\u0443\u0449\u0438\u0439', 'Joriy')}</div>
                    ) : (
                      <Button onClick={() => handleUpgrade(code)} disabled={submitting} className="sg-btn primary" style={{ width: '100%' }}>
                        {plan.price === 0 ? tr('\u041f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0438\u0442\u044c', "O'tish") : tr('\u041f\u0435\u0440\u0435\u0439\u0442\u0438', 'Yangilash')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      <section className="sg-card">
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{tr('\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0441\u0447\u0435\u0442\u043e\u0432', 'Hisoblar tarixi')}</h3>
        <table className="sg-table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>{tr('\u0414\u0430\u0442\u0430', 'Sana')}</th>
              <th>{tr('\u0422\u0430\u0440\u0438\u0444', 'Tarif')}</th>
              <th>{tr('\u0421\u0443\u043c\u043c\u0430', 'Summa')}</th>
              <th>{tr('\u0421\u0442\u0430\u0442\u0443\u0441', 'Holat')}</th>
              <th>{tr('\u0422\u0440\u0430\u043d\u0437\u0430\u043a\u0446\u0438\u044f', 'Tranzaksiya')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const st = statusMap[inv.status] || { label: inv.status, color: '#6b7280' };
              return (
                <tr key={inv.id}>
                  <td>{new Date(inv.createdAt).toLocaleDateString(locale)}</td>
                  <td>{inv.plan}</td>
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
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('Plan payment', "Tarif to'lovi")} {showInvoice.invoice.plan}</h3>
            <p className="sg-subtitle">{tr('Transfer payment and enter transaction reference', "To'lovni o'tkazing va tranzaksiya raqamini kiriting")}</p>

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
