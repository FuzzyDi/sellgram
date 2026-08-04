import React, { useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../../api/system-admin-client';
import SysOverview from './SysOverview';
import SysTenants from './SysTenants';
import SysInvoices from './SysInvoices';
import SysMonitoring from './SysMonitoring';
import SysUsers from './SysUsers';
import SysAnnouncements from './SysAnnouncements';
import SysAnalytics from './SysAnalytics';
import SysSettings from './SysSettings';
import SysPlans from './SysPlans';
import SysPayment from './SysPayment';
import SysPolicies from './SysPolicies';
import SysProductTypes from './SysProductTypes';

export type SysPage = 'overview' | 'tenants' | 'invoices' | 'monitoring' | 'users' | 'announcements' | 'analytics' | 'plans' | 'payment' | 'policies' | 'productTypes' | 'settings';

const NAV: { id: SysPage; label: string; icon: string }[] = [
  { id: 'overview',      label: 'Dashboard',       icon: '🏠' },
  { id: 'tenants',       label: 'Тенанты',          icon: '🏢' },
  { id: 'invoices',      label: 'Инвойсы',          icon: '💳' },
  { id: 'monitoring',    label: 'Мониторинг',       icon: '📡' },
  { id: 'users',         label: 'Пользователи',     icon: '👤' },
  { id: 'announcements', label: 'Объявления',       icon: '📣' },
  { id: 'analytics',     label: 'Аналитика',        icon: '📊' },
  { id: 'plans',         label: 'Тарифы',           icon: '📋' },
  { id: 'payment',       label: 'Оплата',           icon: '💰' },
  { id: 'policies',      label: 'Политики POS',     icon: '🛡️' },
  { id: 'productTypes',  label: 'Типы товаров',     icon: '🏷️' },
  { id: 'settings',      label: 'Настройки',        icon: '⚙️' },
];

// Deliberately not routed through Card/Button/Input — those default to a
// light background/border palette (docs/ADMIN_REDESIGN.md §2's tenant
// admin look), while the system-admin shell is a distinct dark "internal
// tool" identity that predates and isn't meant to match it. Adopts the
// same token-* font/radius scale and Tailwind's own slate/blue/red
// palette (exact matches for the hex values this file used before) for
// consistency, without forcing light-theme components onto a dark UI.
function SysLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await systemApi.login(email, password);
      onLogin(data?.token || sessionStorage.getItem('systemToken') || '');
    } catch (err: any) {
      setError(err.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <form onSubmit={handleLogin} className="bg-slate-800 rounded-token-lg w-[360px] shadow-2xl" style={{ padding: '40px 36px' }}>
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🛡️</div>
          <h1 className="m-0 text-slate-50 text-token-2xl font-extrabold">SellGram System</h1>
          <p className="mt-1.5 mb-0 text-slate-500 text-token-sm">Системная панель администратора</p>
        </div>
        {error && (
          <div className="bg-red-950 border border-red-900 rounded-token-md px-3 py-2.5 mb-4 text-red-300 text-token-sm">
            {error}
          </div>
        )}
        <div className="mb-3.5">
          <label className="block text-slate-400 text-token-xs font-semibold mb-1.5 uppercase tracking-wide">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus required
            className="w-full box-border bg-slate-900 border border-slate-700 rounded-token-md px-3 py-2.5 text-slate-50 text-token-base outline-none focus:border-blue-500" />
        </div>
        <div className="mb-6">
          <label className="block text-slate-400 text-token-xs font-semibold mb-1.5 uppercase tracking-wide">Пароль</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
            className="w-full box-border bg-slate-900 border border-slate-700 rounded-token-md px-3 py-2.5 text-slate-50 text-token-base outline-none focus:border-blue-500" />
        </div>
        <button type="submit" disabled={loading}
          className={`w-full bg-blue-500 text-white border-none rounded-token-md p-3 font-bold text-token-lg ${loading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </div>
  );
}

export default function SysLayout() {
  const [token, setToken] = useState<string | null>(sessionStorage.getItem('systemToken'));
  const [page, setPage] = useState<SysPage>('overview');
  const [collapsed, setCollapsed] = useState(false);

  function handleLogin(t: string) { setToken(t); }
  function handleLogout() { clearSystemToken(); setToken(null); }

  if (!token) return <SysLogin onLogin={handleLogin} />;

  const sideW = collapsed ? 56 : 220;

  return (
    <div className="flex bg-slate-900" style={{ height: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside
        className="bg-slate-900 flex flex-col border-r border-slate-800 overflow-hidden"
        style={{ width: sideW, minWidth: sideW, transition: 'width 0.2s ease' }}
      >
        {/* Header */}
        <div
          className={`flex items-center gap-2.5 border-b border-slate-800 ${collapsed ? 'justify-center' : 'justify-between'}`}
          style={{ padding: collapsed ? '16px 0' : '16px 16px' }}
        >
          {!collapsed && <div>
            <div className="text-slate-50 font-extrabold text-token-lg leading-tight">SellGram</div>
            <div className="text-slate-500 text-[11px]">System Admin</div>
          </div>}
          <button onClick={() => setCollapsed(!collapsed)} className="bg-transparent border-none text-slate-600 cursor-pointer text-token-lg p-1 rounded-token-sm flex-shrink-0">
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                title={collapsed ? item.label : undefined}
                className={[
                  'w-full flex items-center gap-2.5 border-none cursor-pointer text-token-sm transition-colors',
                  collapsed ? 'justify-center' : 'justify-start',
                  active ? 'bg-blue-500/15 border-l-[3px] border-l-blue-500 text-blue-400 font-bold' : 'border-l-[3px] border-l-transparent text-slate-500 font-normal',
                ].join(' ')}
                style={{ padding: collapsed ? '10px 0' : '10px 16px' }}
              >
                <span className="text-token-lg flex-shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className={`border-t border-slate-800 flex ${collapsed ? 'justify-center' : 'justify-start'}`} style={{ padding: collapsed ? '12px 0' : '12px 16px' }}>
          <button onClick={handleLogout} title={collapsed ? 'Выйти' : undefined}
            className="bg-transparent border-none text-slate-500 cursor-pointer text-token-sm flex items-center gap-2 px-2 py-1.5 rounded-token-sm">
            <span className="text-token-base">🚪</span>
            {!collapsed && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto bg-slate-100">
        {page === 'overview'      && <SysOverview onNavigate={setPage} />}
        {page === 'tenants'       && <SysTenants />}
        {page === 'invoices'      && <SysInvoices />}
        {page === 'monitoring'    && <SysMonitoring />}
        {page === 'users'         && <SysUsers />}
        {page === 'announcements' && <SysAnnouncements />}
        {page === 'analytics'     && <SysAnalytics />}
        {page === 'plans'         && <SysPlans />}
        {page === 'payment'       && <SysPayment />}
        {page === 'policies'      && <SysPolicies />}
        {page === 'productTypes'  && <SysProductTypes />}
        {page === 'settings'      && <SysSettings />}
      </main>
    </div>
  );
}
