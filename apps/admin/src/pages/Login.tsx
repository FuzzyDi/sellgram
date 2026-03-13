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

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-zа-яёa-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        if (!name || !tenantName) {
          setError(tr('Заполните все поля', "Barcha maydonlarni to'ldiring"));
          setLoading(false);
          return;
        }
        await onRegister({ email, password, name, tenantName, tenantSlug: slugify(tenantName) });
      }
    } catch (err: any) {
      setError(err.message || tr('Ошибка', 'Xatolik'));
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.2fr 1fr', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 48%, #0f172a 100%)' }}>
      <div style={{ padding: '40px clamp(20px, 6vw, 64px)', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800, letterSpacing: -1 }}>Sell<span style={{ color: '#00b96b' }}>Gram</span></h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', marginTop: 16, color: '#94a3b8', lineHeight: 1.6 }}>
          {tr('Telegram-магазин за 5 минут.', 'Telegram do‘koni 5 daqiqada.')}<br />
          {tr('Запустите продажи через Telegram.', 'Telegram orqali savdoni boshlang.')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 28 }}>
          {[tr('Каталог товаров', 'Mahsulot katalogi'), tr('Онлайн-заказы', 'Onlayn buyurtmalar'), tr('Программа лояльности', 'Loyallik dasturi'), tr('Аналитика', 'Analitika')].map((f) => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 14 }}>
              <span style={{ color: '#00b96b' }}>?</span> {f}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px clamp(14px, 3vw, 28px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 24, padding: '26px clamp(18px,3vw,34px)', boxShadow: '0 25px 50px rgba(0,0,0,0.28)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setLang('ru')} style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, background: lang === 'ru' ? '#0f172a' : '#fff', color: lang === 'ru' ? '#fff' : '#334155' }}>RU</button>
              <button onClick={() => setLang('uz')} style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, background: lang === 'uz' ? '#0f172a' : '#fff', color: lang === 'uz' ? '#fff' : '#334155' }}>UZ</button>
            </div>
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{mode === 'login' ? tr('Вход в панель', 'Panelga kirish') : tr('Создать магазин', "Do'kon yaratish")}</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>{mode === 'login' ? tr('Войдите для управления магазином', "Do'konni boshqarish uchun kiring") : tr('Бесплатная регистрация за 30 секунд', "30 soniyada bepul ro'yxatdan o'ting")}</p>

          {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mode === 'register' && (
                <>
                  <Field label={tr('Название магазина', "Do'kon nomi")}>
                    <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder={tr('Мой магазин', "Mening do'konim")} style={inputStyle} />
                  </Field>
                  <Field label={tr('Ваше имя', 'Ismingiz')}>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Иван Иванов', 'Ali Valiyev')} style={inputStyle} />
                  </Field>
                </>
              )}

              <Field label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} />
              </Field>

              <Field label={tr('Пароль', 'Parol')}>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr('Минимум 6 символов', 'Kamida 6 ta belgi')} style={inputStyle} />
              </Field>
            </div>

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', marginTop: 18, borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', background: 'linear-gradient(135deg, #00875a, #00b96b)', color: '#fff', opacity: loading ? 0.6 : 1 }}>
              {loading ? '...' : mode === 'login' ? tr('Войти', 'Kirish') : tr('Создать магазин', "Do'kon yaratish")}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#6b7280' }}>
            {mode === 'login' ? (
              <>{tr('Нет аккаунта?', "Akkauntingiz yo'qmi?")} <button onClick={() => { setMode('register'); setError(''); }} style={linkBtn}>{tr('Зарегистрироваться', "Ro'yxatdan o'tish")}</button></>
            ) : (
              <>{tr('Уже есть аккаунт?', 'Akkauntingiz bormi?')} <button onClick={() => { setMode('login'); setError(''); }} style={linkBtn}>{tr('Войти', 'Kirish')}</button></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  fontSize: 14,
  boxSizing: 'border-box',
  outline: 'none',
};

const linkBtn: React.CSSProperties = {
  color: '#3b82f6',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 500,
};

