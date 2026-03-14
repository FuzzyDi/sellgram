import React, { createContext, useContext, useMemo, useState } from 'react';

export type Lang = 'ru' | 'uz';

const STORAGE_KEY = 'sellgram_admin_lang';

const dict = {
  ru: {
    dashboard: 'Дашборд',
    orders: 'Заказы',
    products: 'Товары',
    categories: 'Категории',
    customers: 'Клиенты',
    payments: 'Оплата',
    broadcasts: 'Рассылки',
    settings: 'Настройки',
    plans: 'Тарифы',
    loading: 'Загрузка...',
    sign_out: 'Выйти',
    language: 'Язык',
  },
  uz: {
    dashboard: 'Boshqaruv paneli',
    orders: 'Buyurtmalar',
    products: 'Mahsulotlar',
    categories: 'Toifalar',
    customers: 'Mijozlar',
    payments: "To'lov",
    broadcasts: 'Xabarnomalar',
    settings: 'Sozlamalar',
    plans: 'Tariflar',
    loading: 'Yuklanmoqda...',
    sign_out: 'Chiqish',
    language: 'Til',
  },
} as const;

type Key = keyof typeof dict.ru;

interface I18nValue {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: Key) => string;
  tr: (ru: string, uz: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function AdminI18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === 'ru' || saved === 'uz') return saved;
    return 'ru';
  });

  const setLang = (next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  };

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      locale: lang === 'uz' ? 'uz-UZ' : 'ru-RU',
      setLang,
      t: (key: Key) => (lang === 'uz' ? dict.uz[key] : dict.ru[key]),
      tr: (ru: string, uz: string) => (lang === 'uz' ? uz : ru),
    }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useAdminI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useAdminI18n must be used inside AdminI18nProvider');
  return ctx;
}
