import React, { useEffect, useMemo, useState } from 'react';
import { useTelegram } from './hooks/useTelegram';
import { setAuthData } from './api/client';
import Catalog from './pages/Catalog';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderStatus from './pages/OrderStatus';
import MyOrders from './pages/MyOrders';
import Loyalty from './pages/Loyalty';
import { Lang, MiniI18nProvider, useMiniI18n } from './i18n';

function resolveDefaultLang(code?: string): Lang {
  if (!code) return 'ru';
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

export function navigate(path: string) {
  window.location.hash = path;
}

function LanguageSwitch() {
  const { lang, setLang } = useMiniI18n();

  return (
    <div
      style={{
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: 99,
        background: 'rgba(16, 33, 23, 0.82)',
        borderRadius: 999,
        padding: 3,
        display: 'flex',
        gap: 4,
      }}
    >
      <button
        onClick={() => setLang('ru')}
        style={{
          border: 'none',
          borderRadius: 999,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 800,
          color: lang === 'ru' ? '#fff' : '#aab9b0',
          background: lang === 'ru' ? '#00875a' : 'transparent',
          cursor: 'pointer',
        }}
      >
        RU
      </button>
      <button
        onClick={() => setLang('uz')}
        style={{
          border: 'none',
          borderRadius: 999,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 800,
          color: lang === 'uz' ? '#fff' : '#aab9b0',
          background: lang === 'uz' ? '#00875a' : 'transparent',
          cursor: 'pointer',
        }}
      >
        UZ
      </button>
    </div>
  );
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
    return (
      <div className="flex items-center justify-center h-screen">
        <span>{tr('Загрузка...', 'Yuklanmoqda...')}</span>
      </div>
    );
  }

  const normalizedRoute = route.split('?')[0] || '/';
  const [path, id] = normalizedRoute.split('/').filter(Boolean);
  const isKnownRoute = ['product', 'cart', 'checkout', 'order', 'orders', 'loyalty'].includes(path || '');

  return (
    <>
      <LanguageSwitch />
      {path === 'product' && <Product id={id} />}
      {path === 'cart' && <Cart />}
      {path === 'checkout' && <Checkout />}
      {path === 'order' && <OrderStatus id={id} />}
      {path === 'orders' && <MyOrders />}
      {path === 'loyalty' && <Loyalty />}
      {(!path || !isKnownRoute) && <Catalog />}
    </>
  );
}

export default function App() {
  const { user } = useTelegram();
  const defaultLang = useMemo(() => resolveDefaultLang(user?.language_code), [user?.language_code]);

  return (
    <MiniI18nProvider defaultLang={defaultLang}>
      <AppShell />
    </MiniI18nProvider>
  );
}
