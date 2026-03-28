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

export type SysPage = 'overview' | 'tenants' | 'invoices' | 'monitoring' | 'users' | 'announcements' | 'analytics' | 'plans' | 'payment' | 'settings';

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
  { id: 'settings',      label: 'Настройки',        icon: '⚙️' },
];

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <form onSubmit={handleLogin} style={{ background: '#1e293b', borderRadius: 16, padding: '40px 36px', width: 360, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛡️</div>
          <h1 style={{ margin: 0, color: '#f8fafc', fontSize: 22, fontWeight: 800 }}>SellGram System</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Системная панель администратора</p>
        </div>
        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 12px', marginBottom: 16, color: '#fca5a5', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus required
            style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#f8fafc', fontSize: 14, outline: 'none' }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Пароль</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
            style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#f8fafc', fontSize: 14, outline: 'none' }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ width: '100%', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
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
    <div style={{ display: 'flex', height: '100vh', background: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: sideW, minWidth: sideW, background: '#0f172a', display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #1e293b', transition: 'width 0.2s ease', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: collapsed ? '16px 0' : '16px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #1e293b', justifyContent: collapsed ? 'center' : 'space-between' }}>
          {!collapsed && <div>
            <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>SellGram</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>System Admin</div>
          </div>}
          <button onClick={() => setCollapsed(!collapsed)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, padding: 4, borderRadius: 6, flexShrink: 0 }}>
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {NAV.map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                title={collapsed ? item.label : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: collapsed ? '10px 0' : '10px 16px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  background: active ? 'rgba(59,130,246,0.15)' : 'none',
                  border: 'none', borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                  color: active ? '#60a5fa' : '#64748b',
                  cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 17, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: collapsed ? '12px 0' : '12px 16px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <button onClick={handleLogout} title={collapsed ? 'Выйти' : undefined}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6 }}>
            <span style={{ fontSize: 16 }}>🚪</span>
            {!collapsed && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, overflow: 'auto', background: '#f1f5f9' }}>
        {page === 'overview'      && <SysOverview onNavigate={setPage} />}
        {page === 'tenants'       && <SysTenants />}
        {page === 'invoices'      && <SysInvoices />}
        {page === 'monitoring'    && <SysMonitoring />}
        {page === 'users'         && <SysUsers />}
        {page === 'announcements' && <SysAnnouncements />}
        {page === 'analytics'     && <SysAnalytics />}
        {page === 'plans'         && <SysPlans />}
        {page === 'payment'       && <SysPayment />}
        {page === 'settings'      && <SysSettings />}
      </main>
    </div>
  );
}
