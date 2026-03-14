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
    reports: 'Отчеты',
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
    reports: 'Hisobotlar',
    settings: 'Sozlamalar',
    plans: 'Tariflar',
    loading: 'Yuklanmoqda...',
    sign_out: 'Chiqish',
    language: 'Til',
  },
} as const;

const CP1251_EXTRA_MAP: Record<number, number> = {
  0x0404: 0xaa,
  0x0454: 0xba,
  0x0407: 0xaf,
  0x0457: 0xbf,
  0x0406: 0xb2,
  0x0456: 0xb3,
  0x0490: 0xa5,
  0x0491: 0xb4,
};

function looksLikeBrokenCyrillic(input: string): boolean {
  const matches = input.match(/[РС][\u0400-\u04ff]/g);
  return Boolean(matches && matches.length >= 2);
}

function fixBrokenCyrillic(input: string): string {
  if (!looksLikeBrokenCyrillic(input)) return input;

  const bytes: number[] = [];
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7f) {
      bytes.push(code);
      continue;
    }
    if (code === 0x0401) {
      bytes.push(0xa8);
      continue;
    }
    if (code === 0x0451) {
      bytes.push(0xb8);
      continue;
    }
    if (code >= 0x0410 && code <= 0x044f) {
      bytes.push(code - 0x350);
      continue;
    }
    if (CP1251_EXTRA_MAP[code] !== undefined) {
      bytes.push(CP1251_EXTRA_MAP[code]);
      continue;
    }
    return input;
  }

  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  return /[А-Яа-яЁё]/.test(decoded) ? decoded : input;
}

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
      tr: (ru: string, uz: string) => (lang === 'uz' ? uz : fixBrokenCyrillic(ru)),
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
