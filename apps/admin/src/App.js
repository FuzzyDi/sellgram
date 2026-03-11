import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { adminApi, setTokens, clearTokens } from './api/client';
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
function useRoute() {
    const [route, setRoute] = useState(window.location.hash.slice(1) || '/');
    useEffect(() => {
        const handler = () => setRoute(window.location.hash.slice(1) || '/');
        window.addEventListener('hashchange', handler);
        return () => window.removeEventListener('hashchange', handler);
    }, []);
    const navigate = (path) => { window.location.hash = path; };
    return { route, navigate };
}
function Sidebar({ route, navigate, auth, onLogout }) {
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
    const planBadge = {
        FREE: { bg: '#f3f4f6', text: '#6b7280' },
        PRO: { bg: '#dbeafe', text: '#2563eb' },
        BUSINESS: { bg: '#ede9fe', text: '#7c3aed' },
    };
    const badge = planBadge[auth.tenant?.plan] || planBadge.FREE;
    return (_jsxs("aside", { style: { width: 250, background: '#0f172a', height: '100vh', display: 'flex', flexDirection: 'column', color: '#fff' }, children: [_jsxs("div", { style: { padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }, children: [_jsxs("h1", { style: { fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }, children: ["Sell", _jsx("span", { style: { color: '#00b96b' }, children: "Gram" })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }, children: [_jsx("span", { style: { fontSize: 13, color: '#94a3b8' }, children: auth.tenant?.name }), _jsx("span", { style: { fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: badge.bg, color: badge.text }, children: auth.tenant?.plan })] })] }), _jsx("nav", { style: { flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }, children: links.map((link) => (_jsx(Button, { onClick: () => navigate(link.to), className: `px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${route === link.to ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`, children: _jsx("span", { children: link.label }) }, link.to))) }), _jsxs("div", { style: { padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px 8px' }, children: [_jsx("span", { style: { fontSize: 11, color: '#64748b' }, children: t('language') }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("button", { onClick: () => setLang('ru'), style: { border: 'none', borderRadius: 8, padding: '2px 8px', fontSize: 11, cursor: 'pointer', background: lang === 'ru' ? '#334155' : '#1e293b', color: '#e2e8f0' }, children: "RU" }), _jsx("button", { onClick: () => setLang('uz'), style: { border: 'none', borderRadius: 8, padding: '2px 8px', fontSize: 11, cursor: 'pointer', background: lang === 'uz' ? '#334155' : '#1e293b', color: '#e2e8f0' }, children: "UZ" })] })] }), _jsx("p", { style: { fontSize: 12, color: '#64748b', padding: '4px 12px' }, children: auth.user?.email }), _jsx(Button, { onClick: onLogout, className: "text-sm text-red-400 hover:text-red-300 px-3 py-1.5 w-full text-left", children: t('sign_out') })] })] }));
}
function PageRouter({ route }) {
    switch (route) {
        case '/products': return _jsx(Products, {});
        case '/categories': return _jsx(Categories, {});
        case '/orders': return _jsx(Orders, {});
        case '/customers': return _jsx(Customers, {});
        case '/payments': return _jsx(PaymentMethods, {});
        case '/broadcasts': return _jsx(Broadcasts, {});
        case '/settings': return _jsx(Settings, {});
        case '/billing': return _jsx(Billing, {});
        case '/system': return _jsx(SystemAdmin, {});
        default: return _jsx(Dashboard, {});
    }
}
export default function App() {
    const { t } = useAdminI18n();
    const [auth, setAuth] = useState(null);
    const [loading, setLoading] = useState(true);
    const { route, navigate } = useRoute();
    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            adminApi.me()
                .then((user) => setAuth({ user, tenant: user.tenant }))
                .catch(() => clearTokens())
                .finally(() => setLoading(false));
        }
        else {
            setLoading(false);
        }
    }, []);
    const handleLogin = async (email, password) => {
        const result = await adminApi.login(email, password);
        setTokens(result.accessToken, result.refreshToken);
        setAuth({ user: result.user, tenant: result.tenant });
    };
    const handleRegister = async (data) => {
        const result = await adminApi.register(data);
        setTokens(result.accessToken, result.refreshToken);
        setAuth({ user: result.user, tenant: result.tenant });
    };
    const logout = () => { clearTokens(); setAuth(null); };
    if (loading) {
        return (_jsx("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }, children: _jsx("p", { style: { color: '#94a3b8' }, children: t('loading') }) }));
    }
    if (route === '/system') {
        return (_jsx("div", { style: { minHeight: '100vh', background: '#f8fafc', padding: 24 }, children: _jsx(SystemAdmin, {}) }));
    }
    if (!auth)
        return _jsx(Login, { onLogin: handleLogin, onRegister: handleRegister });
    return (_jsxs("div", { style: { display: 'flex', height: '100vh', background: '#f8fafc' }, children: [_jsx(Sidebar, { route: route, navigate: navigate, auth: auth, onLogout: logout }), _jsx("main", { style: { flex: 1, overflow: 'auto', padding: 24 }, children: _jsx(PageRouter, { route: route }) })] }));
}
