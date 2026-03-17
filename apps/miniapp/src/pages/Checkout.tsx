import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';
import { useTelegramBackButton } from '../hooks/useTelegramBackButton';

type PaymentMethod = {
  id: string;
  provider: string;
  code: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  isDefault?: boolean;
};

export default function Checkout() {
  const { tr } = useMiniI18n();
  const goBack = useCallback(() => navigate('/cart'), []);
  useTelegramBackButton(goBack);
  const [zones, setZones] = useState<any[]>([]);
  const [cart, setCart] = useState<any>(null);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [form, setForm] = useState({
    deliveryType: 'PICKUP',
    deliveryZoneId: '',
    deliveryAddress: '',
    contactPhone: '',
    note: '',
    loyaltyPointsToUse: 0,
    paymentMethodId: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ id: string; type: string; value: number; discount: number } | null>(null);
  const [promoError, setPromoError] = useState('');
  const [promoChecking, setPromoChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  function loadData() {
    setLoadingData(true);
    setLoadError(false);
    Promise.all([
      api.getDeliveryZones().then(setZones),
      api.getCart().then(setCart),
    ])
      .catch(() => setLoadError(true))
      .finally(() => setLoadingData(false));
    api.getLoyalty().then(setLoyalty).catch(() => {});
    api.getPaymentMethods()
      .then((methods: PaymentMethod[]) => {
        const list = Array.isArray(methods) ? methods : [];
        setPaymentMethods(list);
        const defaultMethod = list.find((m) => m.isDefault) || list[0];
        if (defaultMethod) {
          setForm((prev) => ({ ...prev, paymentMethodId: defaultMethod.id }));
        }
      })
      .catch(() => {});
  }

  useEffect(() => { loadData(); }, []);

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((method) => method.id === form.paymentMethodId) || null,
    [paymentMethods, form.paymentMethodId]
  );

  const zone = zones.find((z) => z.id === form.deliveryZoneId);
  const subtotal = cart?.subtotal || 0;
  const deliveryFee =
    form.deliveryType === 'LOCAL' && zone
      ? zone.freeFrom && subtotal >= Number(zone.freeFrom)
        ? 0
        : Number(zone.price)
      : 0;
  const loyaltyDiscount =
    usePoints && loyalty?.config
      ? Math.min(form.loyaltyPointsToUse * loyalty.config.pointValue, subtotal * 0.3)
      : 0;
  const promoDiscount = promoApplied?.discount ?? 0;
  const discount = loyaltyDiscount + promoDiscount;
  const total = subtotal + deliveryFee - discount;

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoChecking(true); setPromoError('');
    try {
      const data = await api.validatePromo(promoCode.trim().toUpperCase(), subtotal);
      setPromoApplied(data);
    } catch (e: any) {
      const code = e.message || '';
      if (code.includes('NOT_FOUND')) setPromoError(tr('Промокод не найден', 'Promokod topilmadi'));
      else if (code.includes('EXPIRED')) setPromoError(tr('Промокод истёк', 'Promokod muddati o\'tgan'));
      else if (code.includes('EXHAUSTED')) setPromoError(tr('Промокод исчерпан', 'Promokod tugagan'));
      else if (code.includes('MIN_ORDER')) setPromoError(tr('Сумма заказа слишком мала', 'Buyurtma summasi yetarli emas'));
      else setPromoError(tr('Недействительный код', 'Noto\'g\'ri kod'));
      setPromoApplied(null);
    } finally { setPromoChecking(false); }
  };

  const submit = async () => {
    if (form.deliveryType === 'LOCAL' && !form.deliveryAddress) {
      setError(tr('Укажите адрес доставки', 'Yetkazib berish manzilini kiriting'));
      return;
    }
    if (!form.paymentMethodId) {
      setError(tr("Выберите способ оплаты", "To'lov usulini tanlang"));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const order = await api.checkout({
        ...form,
        loyaltyPointsToUse: usePoints ? form.loyaltyPointsToUse : 0,
        promoCodeId: promoApplied?.id,
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      navigate(`/order/${order.id}`);
    } catch (err: any) {
      setError(err.message || tr('Ошибка при оформлении', 'Buyurtmada xatolik'));
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
    setSubmitting(false);
  };

  if (loadingData) {
    return (
      <div style={{ padding: 16 }}>
        <div className="skeleton" style={{ height: 28, width: 140, marginBottom: 16 }} />
        {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 56, marginBottom: 10, borderRadius: 'var(--radius-sm)' }} />)}
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p className="error-banner" style={{ marginBottom: 12 }}>{tr('Не удалось загрузить данные', "Ma'lumotlarni yuklab bo'lmadi")}</p>
        <button className="btn secondary sm pill" onClick={loadData}>{tr('Повторить', 'Qayta urinish')}</button>
      </div>
    );
  }

  return (
    <div className="anim-fade" style={{ paddingBottom: 96 }}>
      <div className="glass" style={{ position: 'sticky', top: 0, zIndex: 20, padding: 16, borderBottom: '0.5px solid var(--divider)' }}>
        <button onClick={() => navigate('/cart')} className="btn ghost xs" style={{ marginBottom: 4 }}>← {tr('Корзина', 'Savat')}</button>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{tr('Оформление', 'Rasmiylashtirish')}</h1>
      </div>

      <div style={{ padding: '12px 16px' }}>
        <Section title={tr('Способ получения', 'Yetkazib berish usuli')}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { t: 'PICKUP', icon: '🏪', l: tr('Самовывоз', 'Olib ketish') },
              { t: 'LOCAL', icon: '🚚', l: tr('Доставка', 'Yetkazib berish') },
            ].map((o) => (
              <button key={o.t} onClick={() => setForm({ ...form, deliveryType: o.t })} className="pressable" style={{ flex: 1, padding: '14px 12px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', background: form.deliveryType === o.t ? 'var(--btn)' : 'var(--sec)', color: form.deliveryType === o.t ? 'var(--btn-text)' : 'var(--text)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
                <span>{o.icon}</span> {o.l}
              </button>
            ))}
          </div>
        </Section>

        {form.deliveryType === 'LOCAL' && zones.length > 0 && (
          <Section title={tr('Зона доставки', 'Yetkazib berish hududi')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {zones.map((z) => {
                const free = z.freeFrom && subtotal >= Number(z.freeFrom);
                return (
                  <button key={z.id} onClick={() => setForm({ ...form, deliveryZoneId: z.id })} className="pressable" style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: form.deliveryZoneId === z.id ? 'var(--btn)' : 'var(--sec)', color: form.deliveryZoneId === z.id ? 'var(--btn-text)' : 'var(--text)', fontSize: 14, textAlign: 'left', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500 }}>{z.name}</span>
                    <span style={{ fontSize: 13, opacity: 0.8 }}>{free ? tr('Бесплатно ✨', 'Bepul ✨') : `${Number(z.price).toLocaleString()} ${tr('сум', "so'm")}`}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {form.deliveryType === 'LOCAL' && (
          <Section title={tr('Адрес', 'Manzil')}>
            <textarea className="field" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} rows={2} placeholder={tr('Улица, дом, квартира', 'Kocha, uy, xonadon')} />
          </Section>
        )}

        <Section title={tr('Телефон', 'Telefon')}>
          <input type="tel" className="field" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="+998 90 123 45 67" />
        </Section>

        <Section title={tr('Способ оплаты', "To'lov usuli")}>
          {paymentMethods.length === 0 ? (
            <div className="card" style={{ color: 'var(--hint)', fontSize: 14 }}>
              {tr('Способы оплаты не настроены', "To'lov usullari sozlanmagan")}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  onClick={() => setForm((prev) => ({ ...prev, paymentMethodId: method.id }))}
                  className="pressable"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: form.paymentMethodId === method.id ? 'var(--btn)' : 'var(--sec)',
                    color: form.paymentMethodId === method.id ? 'var(--btn-text)' : 'var(--text)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{method.title}</div>
                  {method.description && <div style={{ marginTop: 2, fontSize: 12, opacity: 0.85 }}>{method.description}</div>}
                </button>
              ))}
            </div>
          )}
          {selectedPaymentMethod?.instructions && (
            <div style={{ marginTop: 8, background: 'var(--accent-light)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr('Инструкция по оплате', "To'lov bo'yicha ko'rsatma")}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{selectedPaymentMethod.instructions}</div>
            </div>
          )}
        </Section>

        <Section title={tr('Комментарий', 'Izoh')}>
          <textarea className="field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} placeholder={tr('Пожелания (необязательно)', 'Istaklar (ixtiyoriy)')} />
        </Section>

        {loyalty?.config?.isEnabled && loyalty.balance > 0 && (
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(0,135,90,0.08), rgba(0,185,107,0.06))', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14 }}>⭐ {tr('Списать баллы', 'Ballarni ishlatish')}</p>
                <p style={{ fontSize: 12, color: 'var(--hint)', marginTop: 2 }}>{loyalty.balance} {tr('баллов', 'ball')} = {(loyalty.balance * loyalty.config.pointValue).toLocaleString()} {tr('сум', "so'm")}</p>
              </div>
              <Toggle checked={usePoints} onChange={(v) => {
                setUsePoints(v);
                if (v) setForm({ ...form, loyaltyPointsToUse: loyalty.balance });
              }} />
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 20 }}>
          <p className="section-title" style={{ marginTop: 0 }}>{tr('Промокод', 'Promokod')}</p>
          {promoApplied ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(0,135,90,0.1)', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>✓ {promoCode.toUpperCase()}</span>
                <span style={{ fontSize: 13, color: 'var(--hint)', marginLeft: 8 }}>−{promoApplied.discount.toLocaleString()} {tr('сум', "so'm")}</span>
              </div>
              <button onClick={() => { setPromoApplied(null); setPromoCode(''); }} style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field"
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value); setPromoError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
                placeholder={tr('Введите код', 'Kodni kiriting')}
                style={{ flex: 1, textTransform: 'uppercase' }}
              />
              <button
                onClick={applyPromo}
                disabled={promoChecking || !promoCode.trim()}
                className="btn primary"
                style={{ padding: '0 16px', flexShrink: 0 }}
              >
                {promoChecking ? '...' : tr('Применить', 'Qo\'llash')}
              </button>
            </div>
          )}
          {promoError && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#f43f5e' }}>{promoError}</p>}
        </div>

        <div className="card">
          <Row label={tr('Товары', 'Mahsulotlar')} value={`${subtotal.toLocaleString()} ${tr('сум', "so'm")}`} />
          {form.deliveryType === 'LOCAL' && <Row label={tr('Доставка', 'Yetkazish')} value={deliveryFee ? `${deliveryFee.toLocaleString()} ${tr('сум', "so'm")}` : tr('Бесплатно', 'Bepul')} />}
          {loyaltyDiscount > 0 && <Row label={tr('Скидка баллами', 'Ballar chegirmasi')} value={`−${loyaltyDiscount.toLocaleString()} ${tr('сум', "so'm")}`} color="var(--success)" />}
          {promoDiscount > 0 && <Row label={tr('Промокод', 'Promokod')} value={`−${promoDiscount.toLocaleString()} ${tr('сум', "so'm")}`} color="var(--success)" />}
          <div style={{ borderTop: '1px solid var(--divider)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
            <span>{tr('Итого', 'Jami')}</span><span>{total.toLocaleString()} {tr('сум', "so'm")}</span>
          </div>
          {loyalty?.config?.isEnabled && loyalty.config.pointsPerUnit && loyalty.config.unitAmount && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--divider)', fontSize: 12, color: 'var(--hint)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>⭐</span>
              <span>
                {tr('Начислим', 'Hisoblaymiz')}{' '}
                <strong style={{ color: 'var(--success)' }}>
                  +{Math.floor((total / loyalty.config.unitAmount) * loyalty.config.pointsPerUnit)}
                </strong>{' '}
                {tr('баллов за этот заказ', 'ball ushbu buyurtma uchun')}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="glass" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '10px 16px max(env(safe-area-inset-bottom, 0px), 10px)', borderTop: '0.5px solid var(--divider)' }}>
        {error && <div className="error-banner" style={{ marginBottom: 8 }}>{error}</div>}
        <button onClick={submit} disabled={submitting || paymentMethods.length === 0} className="btn success full">
          {submitting ? tr('Оформляем...', 'Yuborilmoqda...') : `${tr('Подтвердить', 'Tasdiqlash')} · ${total.toLocaleString()} ${tr('сум', "so'm")}`}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p className="section-title">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 14 }}>
      <span style={{ color: 'var(--hint)' }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} style={{ width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', position: 'relative', background: checked ? 'var(--success)' : 'rgba(120,120,128,0.16)', transition: 'background 0.2s' }}>
      <div style={{ width: 24, height: 24, borderRadius: 12, background: '#fff', position: 'absolute', top: 2, left: checked ? 22 : 2, transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
    </button>
  );
}
