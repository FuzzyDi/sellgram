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
      .replace(/[^a-zа-яёa-z0-9]+/g, '-')
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
          setError(tr('Fill in all fields', "Barcha maydonlarni to'ldiring"));
          setLoading(false);
          return;
        }
        await onRegister({ email, password, name, tenantName, tenantSlug: slugify(tenantName) });
      }
    } catch (err: any) {
      setError(err.message || tr('Error', 'Xatolik'));
    }
    setLoading(false);
  };

  const features = [
    tr('Catalog management', 'Katalog boshqaruvi'),
    tr('Order workflow', 'Buyurtma oqimi'),
    tr('Loyalty and billing', 'Loyallik va billing'),
    tr('Analytics and broadcasts', 'Analitika va xabarnomalar'),
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1.1fr 0.9fr',
        background: 'linear-gradient(130deg, #0f2134 0%, #162f4a 46%, #0c1724 100%)',
      }}
    >
      <section style={{ color: '#edf3ff', padding: '46px clamp(20px, 6vw, 72px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h1 style={{ fontSize: 'clamp(42px, 6vw, 68px)', lineHeight: 1, margin: 0, fontWeight: 900, letterSpacing: -1.2 }}>
          Sell<span style={{ color: '#00b96b' }}>Gram</span>
        </h1>
        <p style={{ marginTop: 18, fontSize: 'clamp(17px, 2vw, 22px)', lineHeight: 1.55, color: '#9eb3c9', maxWidth: 560 }}>
          {tr('Launch your Telegram store in minutes and manage everything from one clean console.', 'Telegram do\'koningizni bir necha daqiqada ishga tushiring va hammasini bitta qulay konsolda boshqaring.')}
        </p>

        <div className="sg-grid cols-2" style={{ marginTop: 28, maxWidth: 700 }}>
          {features.map((f) => (
            <div key={f} style={{ fontSize: 15, color: '#d8e6f7', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#00b96b', fontWeight: 900 }}>+</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', placeItems: 'center', padding: 18 }}>
        <div style={{ width: '100%', maxWidth: 470, background: '#fff', borderRadius: 26, border: '1px solid #dbe5df', padding: '26px clamp(18px, 3vw, 36px)', boxShadow: '0 28px 50px rgba(7, 18, 29, 0.26)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setLang('ru')} style={langBtn(lang === 'ru')}>RU</button>
              <button onClick={() => setLang('uz')} style={langBtn(lang === 'uz')}>UZ</button>
            </div>
          </div>

          <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.1, fontWeight: 900, letterSpacing: -0.6 }}>
            {mode === 'login' ? tr('Sign in', 'Kirish') : tr('Create store', "Do'kon yaratish")}
          </h2>
          <p style={{ margin: '8px 0 18px', color: '#607167', fontSize: 14 }}>
            {mode === 'login'
              ? tr('Access your admin workspace.', 'Admin panelga kirish.')
              : tr('Create account and start selling.', "Akkaunt yarating va savdoni boshlang.")}
          </p>

          {error && <div style={{ background: '#fff3f3', color: '#c62828', border: '1px solid #ffd9d9', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{error}</div>}

          <form onSubmit={handleSubmit} className="sg-grid" style={{ gap: 10 }}>
            {mode === 'register' && (
              <>
                <Field label={tr('Store name', "Do'kon nomi")}> 
                  <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder={tr('My store', "Mening do'konim")} style={inputStyle} />
                </Field>
                <Field label={tr('Owner name', 'Ismingiz')}>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('John Doe', 'Ali Valiyev')} style={inputStyle} />
                </Field>
              </>
            )}

            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} />
            </Field>

            <Field label={tr('Password', 'Parol')}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr('Minimum 6 chars', 'Kamida 6 belgi')} style={inputStyle} />
            </Field>

            <button type="submit" disabled={loading} style={{ ...submitStyle, opacity: loading ? 0.7 : 1 }}>
              {loading ? '...' : mode === 'login' ? tr('Enter', 'Kirish') : tr('Create', 'Yaratish')}
            </button>
          </form>

          <p style={{ marginTop: 16, color: '#66776d', fontSize: 13, textAlign: 'center' }}>
            {mode === 'login' ? tr('No account?', "Akkauntingiz yo'qmi?") : tr('Already have account?', 'Akkauntingiz bormi?')}{' '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} style={linkStyle}>
              {mode === 'login' ? tr('Register', "Ro'yxatdan o'tish") : tr('Sign in', 'Kirish')}
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
};

const submitStyle: React.CSSProperties = {
  marginTop: 6,
  height: 44,
  border: 0,
  borderRadius: 11,
  background: 'linear-gradient(135deg, #00875a, #00a86f)',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

const linkStyle: React.CSSProperties = {
  border: 0,
  background: 'none',
  color: '#2664d6',
  cursor: 'pointer',
  fontWeight: 700,
};

function langBtn(active: boolean): React.CSSProperties {
  return {
    border: '1px solid #d9e4dd',
    borderRadius: 999,
    padding: '3px 10px',
    background: active ? '#0f2134' : '#fff',
    color: active ? '#fff' : '#2f3f34',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 12,
  };
}
