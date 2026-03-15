import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Tag, Users,
  CreditCard, Megaphone, BarChart2, Settings as SettingsIcon, Receipt,
  HelpCircle, LogOut, Menu, X, type LucideIcon,
} from 'lucide-react';
import { adminApi, clearTokens, setTokens } from './api/store-admin-client';
import { useAdminI18n } from './i18n';
import Billing from './pages/Billing';
import Broadcasts from './pages/Broadcasts';
import Categories from './pages/Categories';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Help from './pages/Help';
import Login from './pages/Login';
import Orders from './pages/Orders';
import PaymentMethods from './pages/PaymentMethods';
import Products from './pages/Products';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SystemAdmin from './pages/SystemAdmin';

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

const NAV_ICONS: Record<string, LucideIcon> = {
  '/':           LayoutDashboard,
  '/orders':     ShoppingCart,
  '/products':   Package,
  '/categories': Tag,
  '/customers':  Users,
  '/payments':   CreditCard,
  '/broadcasts': Megaphone,
  '/reports':    BarChart2,
  '/settings':   SettingsIcon,
  '/billing':    Receipt,
  '/help':       HelpCircle,
};

function Sidebar({
  route, navigate, auth, onLogout, open, onClose,
}: {
  route: string;
  navigate: (p: string) => void;
  auth: AuthState;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
}) {
  const { t, lang, setLang } = useAdminI18n();

  const links = useMemo(() => [
    { to: '/',           label: t('dashboard') },
    { to: '/orders',     label: t('orders'),     perm: 'manageOrders' },
    { to: '/products',   label: t('products'),   perm: 'manageCatalog' },
    { to: '/categories', label: t('categories'), perm: 'manageCatalog' },
    { to: '/customers',  label: t('customers'),  perm: 'manageCustomers' },
    { to: '/payments',   label: t('payments'),   perm: 'manageBilling' },
    { to: '/broadcasts', label: t('broadcasts'), perm: 'manageMarketing' },
    { to: '/reports',    label: t('reports'),    perm: 'viewReports' },
    { to: '/settings',   label: t('settings') },
    { to: '/billing',    label: t('plans'),      perm: 'manageBilling' },
    { to: '/help',       label: t('help') },
  ], [t]);

  const effectivePermissions = auth.user?.effectivePermissions || {};
  const visibleLinks = links.filter((l: any) => !l.perm || Boolean((effectivePermissions as any)[l.perm]));

  function go(path: string) {
    navigate(path);
    onClose();
  }

  return (
    <aside
      className={`sg-sidebar${open ? ' open' : ''}`}
      style={{
        width: 260,
        height: '100vh',
        position: 'sticky',
        top: 0,
        background: 'linear-gradient(180deg, #112336 0%, #0b1726 100%)',
        color: '#e5edf8',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 22, lineHeight: 1, margin: 0, fontWeight: 900, letterSpacing: -0.5 }}>
            Sell<span style={{ color: '#00b96b' }}>Gram</span>
          </h1>
          <button
            onClick={onClose}
            className="sg-mobile-burger"
            style={{ display: 'none' }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: '8px 0 0', color: '#7a9ab4', fontSize: 12, fontWeight: 600 }}>
          {auth.tenant?.name || '—'}
        </p>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {visibleLinks.map((link: any) => {
          const active = route === link.to;
          const Icon = NAV_ICONS[link.to];
          return (
            <button
              key={link.to}
              onClick={() => go(link.to)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                background: active ? 'rgba(255,255,255,0.13)' : 'transparent',
                color: active ? '#fff' : '#94afc6',
                marginBottom: 2,
                transition: 'background 0.14s, color 0.14s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
                  (e.currentTarget as HTMLElement).style.color = '#d4e4f0';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = '#94afc6';
                }
              }}
            >
              {Icon && <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />}
              {link.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
          <span style={{ fontSize: 11, color: '#7a9ab4', fontWeight: 600 }}>{t('language')}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['ru', 'uz'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  border: 0,
                  borderRadius: 8,
                  padding: '3px 10px',
                  background: lang === l ? '#1e3a5f' : 'transparent',
                  color: lang === l ? '#e2e8f0' : '#7a9ab4',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  transition: 'background 0.14s',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ color: '#7a9ab4', fontSize: 12, padding: '0 4px', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {auth.user?.email}
        </div>

        <button
          onClick={onLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            background: 'transparent',
            color: '#f87171',
            transition: 'background 0.14s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <LogOut size={15} />
          {t('sign_out')}
        </button>
      </div>
    </aside>
  );
}

function PageRouter({ route, auth }: { route: string; auth: AuthState }) {
  const perms = auth.user?.effectivePermissions || {};
  const routePermMap: Record<string, string> = {
    '/orders':     'manageOrders',
    '/products':   'manageCatalog',
    '/categories': 'manageCatalog',
    '/customers':  'manageCustomers',
    '/payments':   'manageBilling',
    '/broadcasts': 'manageMarketing',
    '/reports':    'viewReports',
    '/billing':    'manageBilling',
  };
  const needPerm = routePermMap[route];
  if (needPerm && !perms[needPerm]) return <Dashboard />;

  switch (route) {
    case '/system-admin': return <SystemAdmin />;
    case '/products':     return <Products />;
    case '/categories':   return <Categories />;
    case '/orders':       return <Orders />;
    case '/customers':    return <Customers />;
    case '/payments':     return <PaymentMethods />;
    case '/broadcasts':   return <Broadcasts />;
    case '/reports':      return <Reports />;
    case '/settings':     return <Settings />;
    case '/billing':      return <Billing />;
    case '/help':         return <Help />;
    default:              return <Dashboard />;
  }
}

export default function App() {
  const { t } = useAdminI18n();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { route, navigate } = useRoute();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setLoading(false); return; }
    adminApi.me()
      .then((user: any) => setAuth({ user, tenant: user.tenant }))
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [route]);

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
      <div style={{ minHeight: '100vh', display: 'flex' }}>
        {/* Skeleton sidebar */}
        <div style={{ width: 260, flexShrink: 0, background: 'linear-gradient(180deg,#112336 0%,#0b1726 100%)', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 28, width: 140, borderRadius: 8, background: 'rgba(255,255,255,0.1)', marginBottom: 16 }} />
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} style={{ height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.07)' }} />
          ))}
        </div>
        {/* Skeleton content */}
        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="sg-skeleton" style={{ height: 32, width: '35%' }} />
          <div className="sg-skeleton" style={{ height: 18, width: '55%' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 8 }}>
            {[1,2,3,4].map((i) => <div key={i} className="sg-skeleton" style={{ height: 80, borderRadius: 14 }} />)}
          </div>
          <div className="sg-skeleton" style={{ height: 220, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  if (route === '/system-admin') return <SystemAdmin />;
  if (!auth) return <Login onLogin={handleLogin} onRegister={handleRegister} />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="sg-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        route={route}
        navigate={navigate}
        auth={auth}
        onLogout={logout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Mobile top bar */}
        <div className="sg-mobile-header">
          <button
            className="sg-mobile-burger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            Sell<span style={{ color: '#00875a' }}>Gram</span>
          </span>
          <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
            {auth.tenant?.name}
          </span>
        </div>

        <main
          key={route}
          className="sg-page-enter"
          style={{ flex: 1, padding: 20, overflowY: 'auto' }}
        >
          <PageRouter route={route} auth={auth} />
        </main>
      </div>
    </div>
  );
}
