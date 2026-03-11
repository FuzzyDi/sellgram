import React, { useEffect, useState } from 'react';
import { navigate } from '../App';
import { api } from '../api/client';
import { useMiniI18n } from '../i18n';

export default function Checkout() {
  const { tr } = useMiniI18n();
  const [zones, setZones] = useState<any[]>([]);
  const [cart, setCart] = useState<any>(null);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [form, setForm] = useState({
    deliveryType: 'PICKUP',
    deliveryZoneId: '',
    deliveryAddress: '',
    contactPhone: '',
    note: '',
    loyaltyPointsToUse: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [usePoints, setUsePoints] = useState(false);

  useEffect(() => {
    api.getDeliveryZones().then(setZones).catch(() => {});
    api.getCart().then(setCart).catch(() => {});
    api.getLoyalty().then(setLoyalty).catch(() => {});
  }, []);

  const zone = zones.find((z) => z.id === form.deliveryZoneId);
  const subtotal = cart?.subtotal || 0;
  const deliveryFee = form.deliveryType === 'LOCAL' && zone
    ? (zone.freeFrom && subtotal >= Number(zone.freeFrom) ? 0 : Number(zone.price))
    : 0;
  const discount = usePoints && loyalty?.config
    ? Math.min(form.loyaltyPointsToUse * loyalty.config.pointValue, subtotal * 0.3)
    : 0;
  const total = subtotal + deliveryFee - discount;

  const submit = async () => {
    if (form.deliveryType === 'LOCAL' && !form.deliveryAddress) {
      alert(tr('Укажите адрес', 'Manzilni kiriting'));
      return;
    }
    setSubmitting(true);
    try {
      const order = await api.checkout({ ...form, loyaltyPointsToUse: usePoints ? form.loyaltyPointsToUse : 0 });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      navigate(`/order/${order.id}`);
    } catch (err: any) {
      alert(err.message);
    }
    setSubmitting(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--radius-sm)',
    border: '1.5px solid var(--divider)',
    fontSize: 15,
    boxSizing: 'border-box',
    outline: 'none',
    background: 'var(--sec)',
    color: 'var(--text)',
  };

  return (
    <div className="anim-fade" style={{ paddingBottom: 96 }}>
      <div className="glass" style={{ position: 'sticky', top: 0, zIndex: 20, padding: 16, borderBottom: '0.5px solid var(--divider)' }}>
        <button onClick={() => navigate('/cart')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 15, padding: 0, cursor: 'pointer' }}>← {tr('Корзина', 'Savat')}</button>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, marginTop: 4 }}>{tr('Оформление', 'Rasmiylashtirish')}</h1>
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
            <textarea value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} rows={2} style={inputStyle} placeholder={tr('Улица, дом, квартира', 'Ko‘cha, uy, xonadon')} />
          </Section>
        )}

        <Section title={tr('Телефон', 'Telefon')}>
          <input type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} style={inputStyle} placeholder="+998 90 123 45 67" />
        </Section>

        <Section title={tr('Комментарий', 'Izoh')}>
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} style={inputStyle} placeholder={tr('Пожелания (необязательно)', 'Istaklar (ixtiyoriy)')} />
        </Section>

        {loyalty?.config?.isEnabled && loyalty.balance > 0 && (
          <div style={{ background: 'linear-gradient(135deg, rgba(0,135,90,0.08), rgba(0,185,107,0.06))', borderRadius: 'var(--radius)', padding: 14, marginBottom: 20 }}>
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

        <div style={{ background: 'var(--sec)', borderRadius: 'var(--radius)', padding: 14 }}>
          <Row label={tr('Товары', 'Mahsulotlar')} value={`${subtotal.toLocaleString()} ${tr('сум', "so'm")}`} />
          {form.deliveryType === 'LOCAL' && <Row label={tr('Доставка', 'Yetkazish')} value={deliveryFee ? `${deliveryFee.toLocaleString()} ${tr('сум', "so'm")}` : tr('Бесплатно', 'Bepul')} />}
          {discount > 0 && <Row label={tr('Скидка баллами', 'Ballar chegirmasi')} value={`−${discount.toLocaleString()} ${tr('сум', "so'm")}`} color="var(--success)" />}
          <div style={{ borderTop: '1px solid var(--divider)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
            <span>{tr('Итого', 'Jami')}</span><span>{total.toLocaleString()} {tr('сум', "so'm")}</span>
          </div>
        </div>
      </div>

      <div className="glass" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '10px 16px max(env(safe-area-inset-bottom, 0px), 10px)', borderTop: '0.5px solid var(--divider)' }}>
        <button onClick={submit} disabled={submitting} className="pressable" style={{ width: '100%', padding: 16, borderRadius: 'var(--radius)', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', background: submitting ? 'var(--hint)' : 'var(--success)', color: '#fff', transition: 'all 0.2s' }}>
          {submitting ? tr('Оформляем...', 'Yuborilmoqda...') : `${tr('Подтвердить', 'Tasdiqlash')} · ${total.toLocaleString()} ${tr('сум', "so'm")}`}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</p>
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
