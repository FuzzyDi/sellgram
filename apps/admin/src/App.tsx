import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter, Routes, Route, useNavigate, useLocation,
} from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Tag, Users,
  CreditCard, Megaphone, BarChart2, Settings as SettingsIcon, Receipt,
  HelpCircle, LogOut, Menu, X, Truck, ClipboardList, Building2, Boxes, Star, Image, type LucideIcon,
} from 'lucide-react';
import { adminApi, clearTokens, setTokens } from './api/store-admin-client';
import { useAdminI18n } from './i18n';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OnboardingWizard, { isOnboardingDone, markOnboardingDone } from './pages/OnboardingWizard';

const Billing       = lazy(() => import('./pages/Billing'));
const Broadcasts    = lazy(() => import('./pages/Broadcasts'));
const Categories    = lazy(() => import('./pages/Categories'));
const Customers     = lazy(() => import('./pages/Customers'));
const Help          = lazy(() => import('./pages/Help'));
const Orders        = lazy(() => import('./pages/Orders'));
const PaymentMethods = lazy(() => import('./pages/PaymentMethods'));
const Products      = lazy(() => import('./pages/Products'));
const Procurement   = lazy(() => import('./pages/Procurement'));
const Stock         = lazy(() => import('./pages/Stock'));
const Suppliers     = lazy(() => import('./pages/Suppliers'));
const AuditLog      = lazy(() => import('./pages/AuditLog'));
const Reports       = lazy(() => import('./pages/Reports'));
const Reviews       = lazy(() => import('./pages/Reviews'));
const PromoCodes    = lazy(() => import('./pages/PromoCodes'));
const Banners       = lazy(() => import('./pages/Banners'));
const Settings      = lazy(() => import('./pages/Settings'));
const SysLayout     = lazy(() => import('./pages/sys/SysLayout'));

interface AuthState { user: any; tenant: any; }

const NAV_ICONS: Record<string, LucideIcon> = {
  '/':             LayoutDashboard,
  '/orders':       ShoppingCart,
  '/products':     Package,
  '/categories':   Tag,
  '/customers':    Users,
  '/payments':     CreditCard,
  '/procurement':  Truck,
  '/stock':        Boxes,
  '/suppliers':    Building2,
  '/broadcasts':   Megaphone,
  '/reviews':      Star,
  '/promo-codes':  Tag,
  '/banners':      Image,
  '/reports':      BarChart2,
  '/settings':     SettingsIcon,
  '/billing':      Receipt,
  '/audit-log':    ClipboardList,
  '/help':         HelpCircle,
};

// Explicit "no access" state, replacing the old silent fallback to
// <Dashboard/> when a permission is missing (docs/ADMIN_REDESIGN.md §6/§8
// — a deliberate bug fix, not a side effect of the router migration).
// Plain text is intentional here; real styling is Phase 2/3.
function NoAccess() {
  const { tr } = useAdminI18n();
  return (
    <div style={{ padding: 32, color: '#6b7280' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        {tr('Доступ ограничен', 'Kirish cheklangan')}
      </h2>
      <p style={{ margin: 0, fontSize: 14 }}>
        {tr(
          'У вас нет прав для просмотра этого раздела. Обратитесь к владельцу магазина.',
          'Sizda bu bo\'limni ko\'rish uchun huquq yo\'q. Do\'kon egasiga murojaat qiling.'
        )}
      </p>
    </div>
  );
}

function ProtectedRoute({
  perms, requires, children,
}: {
  perms: Record<string, boolean>;
  requires?: string;
  children: React.ReactElement;
}) {
  if (requires && !perms[requires]) return <NoAccess />;
  return children;
}

function Sidebar({
  auth, onLogout, open, onClose,
}: {
  auth: AuthState;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
}) {
  const { t, tr, lang, setLang } = useAdminI18n();
  const navigate = useNavigate();
  const route = useLocation().pathname;

  const links = useMemo(() => [
    { to: '/',           label: t('dashboard') },
    { to: '/orders',     label: t('orders'),     perm: 'manageOrders' },
    { to: '/products',   label: t('products'),   perm: 'manageCatalog' },
    { to: '/categories', label: t('categories'), perm: 'manageCatalog' },
    { to: '/customers',   label: t('customers'),   perm: 'manageCustomers' },
    { to: '/payments',    label: t('payments'),    perm: 'manageBilling' },
    { to: '/procurement', label: t('procurement'), perm: 'manageCatalog' },
    { to: '/stock',       label: t('stock'),       perm: 'manageCatalog' },
    { to: '/suppliers',   label: t('suppliers'),   perm: 'manageCatalog' },
    { to: '/broadcasts',  label: t('broadcasts'),  perm: 'manageMarketing' },
    { to: '/reviews',     label: t('reviews'),     perm: 'manageOrders' },
    { to: '/promo-codes', label: tr('Промокоды', 'Promokodlar'), perm: 'manageSettings' },
    { to: '/banners',     label: tr('Баннеры', 'Bannerlar'),     perm: 'manageSettings' },
    { to: '/reports',    label: t('reports'),    perm: 'viewReports' },
    { to: '/settings',   label: t('settings') },
    { to: '/billing',    label: t('plans'),      perm: 'manageBilling' },
    { to: '/audit-log',  label: tr('Журнал', 'Jurnal'), perm: 'manageSettings' },
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

function TenantApp() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setLoading(false); return; }
    adminApi.me()
      .then((user: any) => {
        setAuth({ user, tenant: user.tenant });
        // Show onboarding only for OWNER role and if not dismissed
        if (!isOnboardingDone() && ['OWNER'].includes(user.role)) {
          adminApi.getStores().then((stores: any) => {
            const list = Array.isArray(stores) ? stores : stores?.items || [];
            if (list.length === 0) setShowOnboarding(true);
          }).catch(() => {});
        }
      })
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const handleLogin = async (email: string, password: string) => {
    const result = await adminApi.login(email, password);
    setTokens(result.accessToken, result.refreshToken);
    setAuth({ user: result.user, tenant: result.tenant });
  };

  const handleRegister = async (data: any) => {
    const result = await adminApi.register(data);
    setTokens(result.accessToken, result.refreshToken);
    setAuth({ user: result.user, tenant: result.tenant });
    // New registrations always get onboarding
    markOnboardingDone(); // clear any stale flag first
    localStorage.removeItem('sg_onboarding_done');
    setShowOnboarding(true);
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

  if (!auth) return <Login onLogin={handleLogin} onRegister={handleRegister} />;
  if (showOnboarding) return <OnboardingWizard onFinish={() => setShowOnboarding(false)} />;

  const perms = auth.user?.effectivePermissions || {};

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
          key={location.pathname}
          className="sg-page-enter"
          style={{ flex: 1, padding: 20, overflowY: 'auto' }}
        >
          <Suspense fallback={<div style={{ padding: 28, color: '#94a3b8' }}>Загрузка...</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/orders" element={<ProtectedRoute perms={perms} requires="manageOrders"><Orders /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute perms={perms} requires="manageCatalog"><Products /></ProtectedRoute>} />
              <Route path="/categories" element={<ProtectedRoute perms={perms} requires="manageCatalog"><Categories /></ProtectedRoute>} />
              <Route path="/procurement" element={<ProtectedRoute perms={perms} requires="manageCatalog"><Procurement /></ProtectedRoute>} />
              <Route path="/stock" element={<ProtectedRoute perms={perms} requires="manageCatalog"><Stock /></ProtectedRoute>} />
              <Route path="/suppliers" element={<ProtectedRoute perms={perms} requires="manageCatalog"><Suppliers /></ProtectedRoute>} />
              <Route path="/customers" element={<ProtectedRoute perms={perms} requires="manageCustomers"><Customers /></ProtectedRoute>} />
              <Route path="/payments" element={<ProtectedRoute perms={perms} requires="manageBilling"><PaymentMethods /></ProtectedRoute>} />
              <Route path="/broadcasts" element={<ProtectedRoute perms={perms} requires="manageMarketing"><Broadcasts /></ProtectedRoute>} />
              <Route path="/reviews" element={<ProtectedRoute perms={perms} requires="manageOrders"><Reviews /></ProtectedRoute>} />
              <Route path="/promo-codes" element={<ProtectedRoute perms={perms} requires="manageSettings"><PromoCodes /></ProtectedRoute>} />
              <Route path="/banners" element={<ProtectedRoute perms={perms} requires="manageSettings"><Banners /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute perms={perms} requires="viewReports"><Reports /></ProtectedRoute>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/billing" element={<ProtectedRoute perms={perms} requires="manageBilling"><Billing /></ProtectedRoute>} />
              <Route path="/audit-log" element={<ProtectedRoute perms={perms} requires="manageSettings"><AuditLog /></ProtectedRoute>} />
              <Route path="/help" element={<Help />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

// Kept structurally separate from TenantApp (docs/ADMIN_REDESIGN.md §6/§9)
// — its own route, its own auth (sessionStorage-based systemApi token,
// entirely unrelated to the tenant `auth` state above), no shared state.
// Splitting it out as its own top-level <Route> (rather than the old
// early-return check inside one component) also means visiting
// /system-admin no longer triggers the tenant adminApi.me() fetch/loading
// skeleton first — a small, incidental efficiency improvement from the
// restructuring, not a deliberate scope addition.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/system-admin/*" element={<Suspense fallback={null}><SysLayout /></Suspense>} />
        <Route path="/*" element={<TenantApp />} />
      </Routes>
    </BrowserRouter>
  );
}
