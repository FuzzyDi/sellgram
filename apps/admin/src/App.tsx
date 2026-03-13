import React, { useEffect, useMemo, useState } from 'react';
import { adminApi, clearTokens, setTokens } from './api/store-admin-client';
import Button from './components/Button';
import { useAdminI18n } from './i18n';
import Billing from './pages/Billing';
import Broadcasts from './pages/Broadcasts';
import Categories from './pages/Categories';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Orders from './pages/Orders';
import PaymentMethods from './pages/PaymentMethods';
import Products from './pages/Products';
import Settings from './pages/Settings';
import SystemAdmin from './pages/SystemAdmin';

interface AuthState {
  user: any;
  tenant: any;
}

function useRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/');

  useEffect(() => {
    const handler = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  return { route, navigate };
}

function Sidebar({ route, navigate, auth, onLogout }: { route: string; navigate: (p: string) => void; auth: AuthState; onLogout: () => void }) {
  const { t, lang, setLang } = useAdminI18n();

  const links = useMemo(
    () => [
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
    ],
    [t]
  );

  return (
    <aside
      style={{
        width: 270,
        height: '100vh',
        position: 'sticky',
        top: 0,
        background: 'linear-gradient(180deg, #112336 0%, #0b1726 100%)',
        color: '#e5edf8',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h1 style={{ fontSize: 24, lineHeight: 1, margin: 0, fontWeight: 900, letterSpacing: -0.5 }}>
          Sell<span style={{ color: '#00b96b' }}>Gram</span>
        </h1>
        <p style={{ margin: '10px 0 0', color: '#98a9bc', fontSize: 12 }}>{auth.tenant?.name || '-'}</p>
      </div>

      <nav style={{ flex: 1, padding: 10, display: 'grid', gap: 4 }}>
        {links.map((link) => {
          const active = route === link.to;
          return (
            <Button
              key={link.to}
              onClick={() => navigate(link.to)}
              className={`text-left px-3 py-2.5 rounded-lg text-sm transition ${
                active ? 'bg-white/15 text-white font-semibold' : 'text-slate-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              {link.label}
            </Button>
          );
        })}
      </nav>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: '#9fb1c4' }}>{t('language')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setLang('ru')}
              style={{
                border: 0,
                borderRadius: 8,
                padding: '2px 8px',
                background: lang === 'ru' ? '#334155' : '#1f2937',
                color: '#e2e8f0',
                cursor: 'pointer',
              }}
            >
              RU
            </button>
            <button
              onClick={() => setLang('uz')}
              style={{
                border: 0,
                borderRadius: 8,
                padding: '2px 8px',
                background: lang === 'uz' ? '#334155' : '#1f2937',
                color: '#e2e8f0',
                cursor: 'pointer',
              }}
            >
              UZ
            </button>
          </div>
        </div>

        <div style={{ color: '#9fb1c4', fontSize: 12, marginBottom: 10 }}>{auth.user?.email}</div>

        <Button onClick={onLogout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-rose-300 hover:text-rose-200 hover:bg-white/6">
          {t('sign_out')}
        </Button>
      </div>
    </aside>
  );
}

function PageRouter({ route }: { route: string }) {
  switch (route) {
    case '/products':
      return <Products />;
    case '/categories':
      return <Categories />;
    case '/orders':
      return <Orders />;
    case '/customers':
      return <Customers />;
    case '/payments':
      return <PaymentMethods />;
    case '/broadcasts':
      return <Broadcasts />;
    case '/settings':
      return <Settings />;
    case '/billing':
      return <Billing />;
    case '/system':
      return <SystemAdmin />;
    default:
      return <Dashboard />;
  }
}

export default function App() {
  const { t } = useAdminI18n();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const { route, navigate } = useRoute();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    adminApi
      .me()
      .then((user: any) => setAuth({ user, tenant: user.tenant }))
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
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

  const logout = () => {
    clearTokens();
    setAuth(null);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p style={{ color: '#6b7280' }}>{t('loading')}</p>
      </div>
    );
  }

  if (!auth) {
    return <Login onLogin={handleLogin} onRegister={handleRegister} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <Sidebar route={route} navigate={navigate} auth={auth} onLogout={logout} />
      <main style={{ flex: 1, padding: 20, overflow: 'auto' }}>
        <PageRouter route={route} />
      </main>
    </div>
  );
}
