import React, { useState } from 'react';
import { useAdminI18n } from '../i18n';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (data: { email: string; password: string; name: string; tenantName: string; tenantSlug: string }) => Promise<void>;
}

export default function Login({ onLogin, onRegister }: Props) {
  const { tr, lang, setLang } = useAdminI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        if (!name || !tenantName) {
          setError(tr('\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0432\u0441\u0435 \u043f\u043e\u043b\u044f', "Barcha maydonlarni to'ldiring"));
          setLoading(false);
          return;
        }
        await onRegister({ email, password, name, tenantName, tenantSlug: slugify(tenantName) });
      }
    } catch (err: any) {
      setError(err.message || tr('\u041e\u0448\u0438\u0431\u043a\u0430', 'Xatolik'));
    }
    setLoading(false);
  };

  const features = [
    tr('\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u043e\u043c', 'Katalog boshqaruvi'),
    tr('\u041f\u043e\u0442\u043e\u043a \u0437\u0430\u043a\u0430\u0437\u043e\u0432', 'Buyurtma oqimi'),
    tr('\u041b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0438 \u0431\u0438\u043b\u043b\u0438\u043d\u0433', 'Loyallik va billing'),
    tr('\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u0438 \u0440\u0430\u0441\u0441\u044b\u043b\u043a\u0438', 'Analitika va xabarnomalar'),
  ];

  return (
    <div className="sg-login">
      {/* Hero */}
      <section className="sg-login-hero" style={{ color: '#edf3ff', padding: '46px clamp(20px, 6vw, 72px)' }}>
        <h1 style={{ fontSize: 'clamp(42px, 5vw, 66px)', lineHeight: 1, margin: 0, fontWeight: 900, letterSpacing: -1.2 }}>
          Sell<span style={{ color: '#00b96b' }}>Gram</span>
        </h1>
        <p style={{ marginTop: 18, fontSize: 'clamp(16px, 2vw, 21px)', lineHeight: 1.55, color: '#9eb3c9', maxWidth: 540 }}>
          {tr(
            "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0435 \u043c\u0430\u0433\u0430\u0437\u0438\u043d \u0432 Telegram \u0437\u0430 \u043c\u0438\u043d\u0443\u0442\u044b \u0438 \u0443\u043f\u0440\u0430\u0432\u043b\u044f\u0439\u0442\u0435 \u0432\u0441\u0435\u043c \u0438\u0437 \u043e\u0434\u043d\u043e\u0439 \u0443\u0434\u043e\u0431\u043d\u043e\u0439 \u043a\u043e\u043d\u0441\u043e\u043b\u0438.",
            "Telegram do'koningizni bir necha daqiqada ishga tushiring va hammasini bitta qulay konsolda boshqaring.",
          )}
        </p>

        <div className="sg-grid cols-2" style={{ marginTop: 28, maxWidth: 680 }}>
          {features.map((f) => (
            <div key={f} style={{ fontSize: 15, color: '#d8e6f7', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#00b96b', fontWeight: 900, fontSize: 18 }}>+</span>
              <span>{f}</span>
            </div>
          ))}
        </div>

        {/* Decorative stats */}
        <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
          {[
            { value: '5 мин', label: tr('\u0434\u043e \u043f\u0435\u0440\u0432\u043e\u0433\u043e \u0437\u0430\u043a\u0430\u0437\u0430', 'birinchi buyurtmagacha') },
            { value: '0 UZS', label: tr('\u0441\u0442\u0430\u0440\u0442 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e', 'bepul boshlash') },
            { value: '24/7', label: tr('\u0440\u0430\u0431\u043e\u0442\u0430 \u0431\u043e\u0442\u0430', 'bot ishlaydi') },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: -0.5 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#7a9ab4', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Form panel */}
      <section className="sg-login-form">
        <div style={{
          width: '100%',
          maxWidth: 470,
          background: '#fff',
          borderRadius: 24,
          border: '1px solid #dbe5df',
          padding: 'clamp(22px, 4vw, 36px)',
          boxShadow: '0 28px 50px rgba(7,18,29,0.26)',
        }}>
          {/* Lang switcher */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 6 }}>
            {(['ru', 'uz'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className="sg-btn ghost"
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '3px 10px',
                  ...(lang === l ? { background: '#0f2134', color: '#fff', borderColor: '#0f2134' } : {}),
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.1, fontWeight: 900, letterSpacing: -0.5 }}>
            {mode === 'login'
              ? tr('\u0412\u0445\u043e\u0434', 'Kirish')
              : tr('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043c\u0430\u0433\u0430\u0437\u0438\u043d', "Do'kon yaratish")}
          </h2>
          <p style={{ margin: '6px 0 18px', color: '#607167', fontSize: 14 }}>
            {mode === 'login'
              ? tr('\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0432 \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430.', 'Admin panelga kirish.')
              : tr('\u0421\u043e\u0437\u0434\u0430\u0439\u0442\u0435 \u0430\u043a\u043a\u0430\u0443\u043d\u0442 \u0438 \u043d\u0430\u0447\u043d\u0438\u0442\u0435 \u043f\u0440\u043e\u0434\u0430\u0436\u0438.', "Akkaunt yarating va savdoni boshlang.")}
          </p>

          {error && (
            <div style={{
              background: '#fff3f3',
              color: '#c62828',
              border: '1px solid #ffd9d9',
              padding: '10px 12px',
              borderRadius: 10,
              fontSize: 13,
              marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="sg-grid" style={{ gap: 10 }}>
            {mode === 'register' && (
              <>
                <Field label={tr('\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430', "Do'kon nomi")}>
                  <input
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder={tr('\u041c\u043e\u0439 \u043c\u0430\u0433\u0430\u0437\u0438\u043d', "Mening do'konim")}
                    style={inputStyle}
                  />
                </Field>
                <Field label={tr('\u0418\u043c\u044f \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430', 'Ismingiz')}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={tr('\u0418\u0432\u0430\u043d \u0418\u0432\u0430\u043d\u043e\u0432', 'Ali Valiyev')}
                    style={inputStyle}
                  />
                </Field>
              </>
            )}

            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                style={inputStyle}
                autoComplete="email"
              />
            </Field>

            <Field label={tr('\u041f\u0430\u0440\u043e\u043b\u044c', 'Parol')}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tr('\u041c\u0438\u043d\u0438\u043c\u0443\u043c 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432', 'Kamida 6 belgi')}
                style={inputStyle}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="sg-btn primary"
              style={{ width: '100%', height: 44, marginTop: 4, fontSize: 15 }}
            >
              {loading
                ? tr('\u0412\u0445\u043e\u0434...', 'Kirilmoqda...')
                : mode === 'login'
                  ? tr('\u0412\u043e\u0439\u0442\u0438', 'Kirish')
                  : tr('\u0421\u043e\u0437\u0434\u0430\u0442\u044c', 'Yaratish')}
            </button>
          </form>

          <p style={{ marginTop: 16, color: '#66776d', fontSize: 13, textAlign: 'center' }}>
            {mode === 'login'
              ? tr('\u041d\u0435\u0442 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430?', "Akkauntingiz yo'qmi?")
              : tr('\u0423\u0436\u0435 \u0435\u0441\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442?', 'Akkauntingiz bormi?')}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              style={{ border: 0, background: 'none', color: '#2664d6', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
            >
              {mode === 'login'
                ? tr('\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f', "Ro'yxatdan o'tish")
                : tr('\u0412\u043e\u0439\u0442\u0438', 'Kirish')}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#58675f', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  borderRadius: 11,
  border: '1px solid #d9e4dd',
  padding: '0 13px',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.14s',
};
