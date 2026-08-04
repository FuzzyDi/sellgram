import React, { useEffect, useMemo, useState } from 'react';
import { useTelegram } from './hooks/useTelegram';
import { api, setAuthData } from './api/client';
import { cartStore } from './stores/cartStore';
import Catalog from './pages/Catalog';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderStatus from './pages/OrderStatus';
import MyOrders from './pages/MyOrders';
import Loyalty from './pages/Loyalty';
import Wishlist from './pages/Wishlist';
import Profile from './pages/Profile';
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
  // If window.Telegram.WebApp never shows up (opened outside Telegram, the
  // WebApp script blocked/slow to load) or the URL is missing storeId/
  // initData, `ready` stays false forever with nothing on screen but a
  // spinner — no error, no way out. This flips to true a few seconds in so
  // that case gets an explanation instead of an infinite "Загрузка...".
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storeId =
      params.get('storeId') ||
      params.get('tgWebAppStartParam') ||
      webApp?.initDataUnsafe?.start_param ||
      '';
    const initDataFromQuery = params.get('tgWebAppData') || '';
    const effectiveInitData = initData || initDataFromQuery;
    if (!storeId || !effectiveInitData) {
      setReady(false);
      return;
    }
    setAuthData(effectiveInitData, storeId);
    setReady(true);
  }, [initData, webApp]);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, [ready]);

  // cartStore starts at 0 and was previously only ever set() by Cart.tsx's
  // own load — a returning customer with items already in their cart saw
  // badge "0" everywhere until they happened to open the Cart tab once.
  // Hydrate it from the server as soon as auth is ready, on every boot.
  useEffect(() => {
    if (!ready) return;
    api.getCart()
      .then((c: any) => cartStore.set(c?.items?.length ?? 0))
      .catch(() => {});
  }, [ready]);

  if (!ready && timedOut) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ padding: 24, textAlign: 'center' }}>
        <div>
          <p style={{ margin: '0 0 12px', color: '#6b7280' }}>
            {tr(
              'Не удалось открыть магазин. Откройте эту страницу через кнопку в Telegram-боте.',
              "Do'konni ochib bo'lmadi. Bu sahifani Telegram-bot tugmasi orqali oching."
            )}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ border: '1px solid #00875a', color: '#00875a', background: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}
          >
            {tr('Попробовать снова', 'Qayta urinish')}
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span>{tr('Загрузка...', 'Yuklanmoqda...')}</span>
      </div>
    );
  }

  const normalizedRoute = route.split('?')[0] || '/';
  const [path, id] = normalizedRoute.split('/').filter(Boolean);
  const isKnownRoute = ['product', 'cart', 'checkout', 'order', 'orders', 'loyalty', 'wishlist', 'profile'].includes(path || '');

  return (
    <>
      <LanguageSwitch />
      {path === 'product' && <Product id={id} />}
      {path === 'cart' && <Cart />}
      {path === 'checkout' && <Checkout />}
      {path === 'order' && <OrderStatus id={id} />}
      {path === 'orders' && <MyOrders />}
      {path === 'loyalty' && <Loyalty />}
      {path === 'wishlist' && <Wishlist />}
      {path === 'profile' && <Profile />}
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
