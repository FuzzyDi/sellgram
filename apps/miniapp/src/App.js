import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useTelegram } from './hooks/useTelegram';
import { setAuthData } from './api/client';
import Catalog from './pages/Catalog';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderStatus from './pages/OrderStatus';
import MyOrders from './pages/MyOrders';
import Loyalty from './pages/Loyalty';
import { MiniI18nProvider, useMiniI18n } from './i18n';
function resolveDefaultLang(code) {
    if (!code)
        return 'ru';
    return code.toLowerCase().startsWith('uz') ? 'uz' : 'ru';
}
function useRoute() {
    const [route, setRoute] = useState(window.location.hash.slice(1) || '/');
    useEffect(() => {
        const handler = () => setRoute(window.location.hash.slice(1) || '/');
        window.addEventListener('hashchange', handler);
        return () => window.removeEventListener('hashchange', handler);
    }, []);
    return route;
}
export function navigate(path) {
    window.location.hash = path;
}
function LanguageSwitch() {
    const { lang, setLang } = useMiniI18n();
    return (_jsxs("div", { style: { position: 'fixed', top: 10, right: 10, zIndex: 99, background: 'rgba(15,23,42,0.78)', backdropFilter: 'blur(8px)', borderRadius: 999, padding: 3, display: 'flex', gap: 4 }, children: [_jsx("button", { onClick: () => setLang('ru'), style: { border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: lang === 'ru' ? '#fff' : '#94a3b8', background: lang === 'ru' ? '#00875a' : 'transparent' }, children: "RU" }), _jsx("button", { onClick: () => setLang('uz'), style: { border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: lang === 'uz' ? '#fff' : '#94a3b8', background: lang === 'uz' ? '#00875a' : 'transparent' }, children: "UZ" })] }));
}
function AppShell() {
    const { tr } = useMiniI18n();
    const { initData, webApp } = useTelegram();
    const route = useRoute();
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const storeId = params.get('storeId') || webApp?.initDataUnsafe?.start_param || '';
        setAuthData(initData, storeId);
        setReady(true);
    }, [initData, webApp]);
    if (!ready) {
        return _jsx("div", { className: "flex items-center justify-center h-screen", children: _jsx("span", { children: tr('Загрузка...', 'Yuklanmoqda...') }) });
    }
    const normalizedRoute = route.split('?')[0] || '/';
    const [path, id] = normalizedRoute.split('/').filter(Boolean);
    const isKnownRoute = ['product', 'cart', 'checkout', 'order', 'orders', 'loyalty'].includes(path || '');
    return (_jsxs(_Fragment, { children: [_jsx(LanguageSwitch, {}), path === 'product' && _jsx(Product, { id: id }), path === 'cart' && _jsx(Cart, {}), path === 'checkout' && _jsx(Checkout, {}), path === 'order' && _jsx(OrderStatus, { id: id }), path === 'orders' && _jsx(MyOrders, {}), path === 'loyalty' && _jsx(Loyalty, {}), (!path || !isKnownRoute) && _jsx(Catalog, {})] }));
}
export default function App() {
    const { user } = useTelegram();
    const defaultLang = useMemo(() => resolveDefaultLang(user?.language_code), [user?.language_code]);
    return (_jsx(MiniI18nProvider, { defaultLang: defaultLang, children: _jsx(AppShell, {}) }));
}
