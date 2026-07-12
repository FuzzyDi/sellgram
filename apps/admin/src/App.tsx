import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter, Routes, Route, useLocation,
} from 'react-router-dom';
import { adminApi, clearTokens, setTokens } from './api/store-admin-client';
import { useAdminI18n } from './i18n';
import AppShell from './components/AppShell';
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
const PosAnalytics  = lazy(() => import('./pages/pos/PosAnalytics'));
const PosDevices    = lazy(() => import('./pages/pos/PosDevices'));
const PosOperators  = lazy(() => import('./pages/pos/PosOperators'));
const PosShifts     = lazy(() => import('./pages/pos/PosShifts'));
const PosReceipts   = lazy(() => import('./pages/pos/PosReceipts'));
const PosSettings   = lazy(() => import('./pages/pos/PosSettings'));
const B2bCounterparties     = lazy(() => import('./pages/b2b/B2bCounterparties'));
const B2bCounterpartyDetail = lazy(() => import('./pages/b2b/B2bCounterpartyDetail'));
const B2bOrders             = lazy(() => import('./pages/b2b/B2bOrders'));
const SysLayout     = lazy(() => import('./pages/sys/SysLayout'));

interface AuthState { user: any; tenant: any; }

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

function TenantApp() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
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
          <div className="animate-pulse bg-neutral-200 rounded" style={{ height: 32, width: '35%' }} />
          <div className="animate-pulse bg-neutral-200 rounded" style={{ height: 18, width: '55%' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 8 }}>
            {[1,2,3,4].map((i) => <div key={i} className="animate-pulse bg-neutral-200 rounded" style={{ height: 80, borderRadius: 14 }} />)}
          </div>
          <div className="animate-pulse bg-neutral-200 rounded" style={{ height: 220, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  if (!auth) {
    return (
      <Login
        onLogin={handleLogin}
        onRegister={handleRegister}
        initialMode={location.pathname === '/register' ? 'register' : 'login'}
      />
    );
  }
  if (showOnboarding) return <OnboardingWizard onFinish={() => setShowOnboarding(false)} />;

  const perms = auth.user?.effectivePermissions || {};

  return (
    <AppShell
      tenantName={auth.tenant?.name}
      userName={auth.user?.name}
      userEmail={auth.user?.email}
      permissions={perms}
      onLogout={logout}
    >
      <div key={location.pathname} className="sg-page-enter">
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
            <Route path="/pos/analytics" element={<ProtectedRoute perms={perms} requires="manageSettings"><PosAnalytics /></ProtectedRoute>} />
            <Route path="/pos/devices" element={<ProtectedRoute perms={perms} requires="manageSettings"><PosDevices /></ProtectedRoute>} />
            <Route path="/pos/operators" element={<ProtectedRoute perms={perms} requires="manageSettings"><PosOperators /></ProtectedRoute>} />
            <Route path="/pos/shifts" element={<ProtectedRoute perms={perms} requires="manageSettings"><PosShifts /></ProtectedRoute>} />
            <Route path="/pos/receipts" element={<ProtectedRoute perms={perms} requires="manageSettings"><PosReceipts /></ProtectedRoute>} />
            <Route path="/pos/settings" element={<ProtectedRoute perms={perms} requires="manageSettings"><PosSettings /></ProtectedRoute>} />
            <Route path="/b2b/counterparties" element={<ProtectedRoute perms={perms} requires="manageB2B"><B2bCounterparties /></ProtectedRoute>} />
            <Route path="/b2b/counterparties/:id" element={<ProtectedRoute perms={perms} requires="manageB2B"><B2bCounterpartyDetail /></ProtectedRoute>} />
            <Route path="/b2b/orders" element={<ProtectedRoute perms={perms} requires="manageB2B"><B2bOrders /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute perms={perms} requires="manageBilling"><Billing /></ProtectedRoute>} />
            <Route path="/audit-log" element={<ProtectedRoute perms={perms} requires="manageSettings"><AuditLog /></ProtectedRoute>} />
            <Route path="/help" element={<Help />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </Suspense>
      </div>
    </AppShell>
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
