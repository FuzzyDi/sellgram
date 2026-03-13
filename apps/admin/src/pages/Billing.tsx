import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/store-admin-client';
import Button from '../components/Button';
import { useAdminI18n } from '../i18n';

const planColors: Record<string, string> = { FREE: '#6b7280', PRO: '#00875a', BUSINESS: '#7c3aed' };

export default function Billing() {
  const { tr, locale } = useAdminI18n();
  const [sub, setSub] = useState<any>(null);
  const [plans, setPlans] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showInvoice, setShowInvoice] = useState<any>(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const statusMap = {
    PENDING: { label: tr('Ожидает оплаты', 'To\'lov kutilmoqda'), color: '#f59e0b' },
    PAID: { label: tr('Оплачен', "To'langan"), color: '#34c759' },
    CANCELLED: { label: tr('Отклонён', 'Rad etilgan'), color: '#ef4444' },
    EXPIRED: { label: tr('Истёк', 'Muddati tugagan'), color: '#6b7280' },
  } as Record<string, { label: string; color: string }>;

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

  useEffect(() => { load(); }, [load]);

  const handleUpgrade = async (plan: string) => {
    setSubmitting(true);
    try {
      const result = await adminApi.upgradePlan(plan);
      if (result.invoice) {
        setShowInvoice(result);
        setPaymentRef('');
      } else {
        load();
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
      alert(tr('Данные оплаты отправлены. Ожидайте подтверждения.', 'To\'lov ma\'lumotlari yuborildi. Tasdiq kutilmoqda.'));
      setShowInvoice(null);
      load();
    } catch (err: any) {
      alert(err.message);
    }
    setSubmitting(false);
  };

  if (loading) return <p className="text-gray-400">{tr('Загрузка...', 'Yuklanmoqda...')}</p>;

  const currentPlan = sub?.plan || 'FREE';
  const usage = sub?.usage || {};

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">💳 {tr('Тарифы и биллинг', 'Tariflar va billing')}</h2>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <p className="text-sm text-gray-500">{tr('Текущий тариф', 'Joriy tarif')}</p>
            <p className="text-2xl font-bold" style={{ color: planColors[currentPlan] }}>{plans?.[currentPlan]?.name || currentPlan}</p>
            {sub?.planExpiresAt && <p className="text-xs text-gray-400 mt-1">{tr('Активен до', 'Amal qilish muddati')}: {new Date(sub.planExpiresAt).toLocaleDateString(locale)}</p>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { key: 'stores', label: tr('Магазины', "Do'konlar"), icon: '🏪' },
            { key: 'products', label: tr('Товары', 'Mahsulotlar'), icon: '🏷️' },
            { key: 'ordersThisMonth', label: tr('Заказы (мес)', 'Buyurtmalar (oy)'), icon: '📦' },
            { key: 'deliveryZones', label: tr('Зоны', 'Hududlar'), icon: '🚚' },
          ].map((item) => {
            const u = usage[item.key];
            if (!u) return null;
            const pct = u.limit === -1 ? 0 : Math.min(100, (u.current / u.limit) * 100);
            return (
              <div key={item.key} style={{ background: '#f9fafb', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="text-sm font-medium">{item.icon} {item.label}</span>
                  <span className="text-sm text-gray-500">{u.current}/{u.limit === -1 ? '∞' : u.limit}</span>
                </div>
                <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3 }}>
                  <div style={{ height: '100%', borderRadius: 3, width: u.limit === -1 ? '5%' : `${pct}%`, background: pct >= 80 ? '#ef4444' : '#00875a' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <h3 className="text-lg font-bold mb-4">{tr('Выберите тариф', 'Tarifni tanlang')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {plans && Object.entries(plans).map(([code, plan]: [string, any]) => {
          const isCurrent = code === currentPlan;
          const isPopular = code === 'PRO';
          return (
            <div key={code} style={{ background: '#fff', borderRadius: 16, padding: 24, position: 'relative', border: isCurrent ? `2px solid ${planColors[code]}` : '1px solid #e5e7eb', boxShadow: isPopular ? '0 8px 30px rgba(0,135,90,0.12)' : 'none' }}>
              {isPopular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#00875a', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20 }}>{tr('Популярный', 'Ommabop')}</div>}
              <p className="text-sm text-gray-500">{plan.name}</p>
              <p className="text-3xl font-bold mt-1" style={{ color: planColors[code] }}>{plan.price > 0 ? plan.price.toLocaleString() : tr('Бесплатно', 'Bepul')}</p>
              {plan.price > 0 && <p className="text-sm text-gray-500">{tr('сум / мес', 'so\'m / oy')}</p>}

              <div style={{ margin: '16px 0' }}>
                {plan.features?.map((f: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
                    <span style={{ color: '#00875a', fontSize: 13, fontWeight: 700 }}>✓</span>
                    <span className="text-sm text-gray-600">{f}</span>
                  </div>
                ))}
              </div>

              {isCurrent ? (
                <div style={{ width: '100%', padding: 10, borderRadius: 10, textAlign: 'center', background: '#f3f4f6', color: '#6b7280', fontSize: 14, fontWeight: 500 }}>{tr('Текущий', 'Joriy')}</div>
              ) : (
                <Button onClick={() => handleUpgrade(code)} className={`w-full py-2.5 rounded-xl text-sm font-semibold text-center ${isPopular ? 'bg-green-600 text-white' : code === 'BUSINESS' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  {plan.price === 0 ? tr('Перейти', "O'tish") : tr('Подключить', 'Ulash')}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {invoices.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-4">{tr('История счетов', 'Hisoblar tarixi')}</h3>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="px-4 py-3">{tr('Дата', 'Sana')}</th>
                <th className="px-4 py-3">{tr('Тариф', 'Tarif')}</th>
                <th className="px-4 py-3">{tr('Сумма', 'Summa')}</th>
                <th className="px-4 py-3">{tr('Статус', 'Holat')}</th>
                <th className="px-4 py-3">{tr('Транзакция', 'Tranzaksiya')}</th>
              </tr></thead>
              <tbody>
                {invoices.map((inv: any) => {
                  const st = statusMap[inv.status] || statusMap.PENDING;
                  return (
                    <tr key={inv.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">{new Date(inv.createdAt).toLocaleDateString(locale)}</td>
                      <td className="px-4 py-3 font-medium">{inv.plan}</td>
                      <td className="px-4 py-3">{Number(inv.amount).toLocaleString()} UZS</td>
                      <td className="px-4 py-3"><span style={{ color: st.color, fontWeight: 600, fontSize: 13 }}>{st.label}</span></td>
                      <td className="px-4 py-3 text-gray-500">{inv.paymentRef || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showInvoice && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="font-bold text-lg mb-2">💳 {tr('Оплата тарифа', 'Tarif to\'lovi')} {showInvoice.invoice.plan}</h3>
            <p className="text-sm text-gray-500 mb-4">{tr('Переведите сумму и введите номер транзакции', 'Summani o\'tkazing va tranzaksiya raqamini kiriting')}</p>

            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }}>
              <p className="text-3xl font-bold" style={{ color: '#00875a' }}>{Number(showInvoice.invoice.amount).toLocaleString()} UZS</p>
            </div>

            <div style={{ background: '#f9fafb', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <p className="text-xs text-gray-500 font-semibold uppercase mb-2">{tr('Реквизиты', 'Rekvizitlar')}</p>
              {showInvoice.bankDetails && Object.entries({
                [tr('Банк', 'Bank')]: showInvoice.bankDetails.bank,
                [tr('Счёт', 'Hisob')]: showInvoice.bankDetails.account,
                [tr('Получатель', 'Qabul qiluvchi')]: showInvoice.bankDetails.recipient,
                [tr('Назначение', 'To\'lov izohi')]: `SellGram ${showInvoice.invoice.plan} — ${showInvoice.invoice.id.slice(0, 8)}`,
              }).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span className="text-sm text-gray-500">{k}</span>
                  <span className="text-sm font-medium" style={{ textAlign: 'right', maxWidth: '60%' }}>{String(v)}</span>
                </div>
              ))}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); submitPayment(); }}>
              <div style={{ marginBottom: 16 }}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Номер транзакции / чека', 'Tranzaksiya / chek raqami')}</label>
                <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="TXN-123456789" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="submit" disabled={submitting || !paymentRef.trim()} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50">{submitting ? '...' : tr('Отправить', 'Yuborish')}</button>
                <Button onClick={() => setShowInvoice(null)} className="px-6 py-2.5 bg-gray-100 rounded-lg">{tr('Позже', 'Keyinroq')}</Button>
              </div>
            </form>

            <p className="text-xs text-gray-400 mt-4 text-center">{tr('Счёт действует 48 часов. После оплаты тариф активируется в течение 1 рабочего дня.', 'Hisob 48 soat amal qiladi. To\'lovdan so\'ng tarif 1 ish kunida faollashadi.')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
