import React, { useState, useEffect } from 'react';
import { adminApi, setTokens, clearTokens } from './api/store-admin-client';
import Button from './components/Button';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import PaymentMethods from './pages/PaymentMethods';
import Broadcasts from './pages/Broadcasts';
import SystemAdmin from './pages/SystemAdmin';
import { useAdminI18n } from './i18n';

interface AuthState { user: any; tenant: any; }

function useRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const handler = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  const navigate = (path: string) => { window.location.hash = path; };
  return { route, navigate };
}

function Sidebar({ route, navigate, auth, onLogout }: { route: string; navigate: (p: string) => void; auth: AuthState; onLogout: () => void }) {
  const { t, lang, setLang } = useAdminI18n();
  const links = [
    { to: '/', label: t('dashboard') },
    { to: '/orders', label: t('orders') },
    { to: '/products', label: t('products') },
    { to: '/categories', label: t('categories') },
    { to: '/customers', label: t('customers') },
    { to: '/payments', label: t('payments') },
    { to: '/broadcasts', label: t('broadcasts') },
    { to: '/settings', label: t('settings') },
    { to: '/billing', label: t('plans') },
    { to: '/system', label: t('system_admin') },
  ];

  const planBadge: Record<string, { bg: string; text: string }> = {
    FREE: { bg: '#f3f4f6', text: '#6b7280' },
    PRO: { bg: '#dbeafe', text: '#2563eb' },
    BUSINESS: { bg: '#ede9fe', text: '#7c3aed' },
  };
  const badge = planBadge[auth.tenant?.plan] || planBadge.FREE;

  return (
    <aside style={{ width: 250, background: '#0f172a', height: '100vh', display: 'flex', flexDirection: 'column', color: '#fff' }}>
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
          Sell<span style={{ color: '#00b96b' }}>Gram</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>{auth.tenant?.name}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: badge.bg, color: badge.text }}>
            {auth.tenant?.plan}
          </span>
        </div>
      </div>
      <nav style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {links.map((link) => (
          <Button
            key={link.to}
            onClick={() => navigate(link.to)}
            className={`px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
              route === link.to ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span>{link.label}</span>
          </Button>
        ))}
      </nav>
      <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px 8px' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>{t('language')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setLang('ru')}
              style={{ border: 'none', borderRadius: 8, padding: '2px 8px', fontSize: 11, cursor: 'pointer', background: lang === 'ru' ? '#334155' : '#1e293b', color: '#e2e8f0' }}
            >RU</button>
            <button
              onClick={() => setLang('uz')}
              style={{ border: 'none', borderRadius: 8, padding: '2px 8px', fontSize: 11, cursor: 'pointer', background: lang === 'uz' ? '#334155' : '#1e293b', color: '#e2e8f0' }}
            >UZ</button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', padding: '4px 12px' }}>{auth.user?.email}</p>
        <Button onClick={onLogout} className="text-sm text-red-400 hover:text-red-300 px-3 py-1.5 w-full text-left">{t('sign_out')}</Button>
      </div>
    </aside>
  );
}

function PageRouter({ route }: { route: string }) {
  switch (route) {
    case '/products': return <Products />;
    case '/categories': return <Categories />;
    case '/orders': return <Orders />;
    case '/customers': return <Customers />;
    case '/payments': return <PaymentMethods />;
    case '/broadcasts': return <Broadcasts />;
    case '/settings': return <Settings />;
    case '/billing': return <Billing />;
    case '/system': return <SystemAdmin />;
    default: return <Dashboard />;
  }
}

export default function App() {
  const { t } = useAdminI18n();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const { route, navigate } = useRoute();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      adminApi.me()
        .then((user: any) => setAuth({ user, tenant: user.tenant }))
        .catch(() => clearTokens())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = async (email: string, password: string) => {
    const result = await adminApi.login(email, password);
    setTokens(result.accessToken, result.refreshToken);
    setAuth({ user: result.user, tenant: result.tenant });
  };

  const handleRegister = async (data: any) => {
    const result = await adminApi.register(data);
    setTokens(result.accessToken, result.refreshToken);
    setAuth({ user: result.user, tenant: result.tenant });
  };

  const logout = () => { clearTokens(); setAuth(null); };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: '#94a3b8' }}>{t('loading')}</p>
      </div>
    );
  }

  if (route === '/system') {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 24 }}>
        <SystemAdmin />
      </div>
    );
  }

  if (!auth) return <Login onLogin={handleLogin} onRegister={handleRegister} />;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f8fafc' }}>
      <Sidebar route={route} navigate={navigate} auth={auth} onLogout={logout} />
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <PageRouter route={route} />
      </main>
    </div>
  );
}


