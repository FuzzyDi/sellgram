import React, { createContext, useContext, useMemo, useState } from 'react';

export type Lang = 'ru' | 'uz';

const STORAGE_KEY = 'sellgram_admin_lang';

const dict = {
  ru: {
    dashboard: 'Р”Р°С€Р±РѕСЂРґ',
    orders: 'Р—Р°РєР°Р·С‹',
    products: 'РўРѕРІР°СЂС‹',
    categories: 'РљР°С‚РµРіРѕСЂРёРё',
    customers: 'РљР»РёРµРЅС‚С‹',
    payments: 'РћРїР»Р°С‚Р°',
    broadcasts: 'Р Р°СЃСЃС‹Р»РєРё',
    reports: 'РћС‚С‡РµС‚С‹',
    settings: 'РќР°СЃС‚СЂРѕР№РєРё',
    plans: 'РўР°СЂРёС„С‹',
    loading: 'Р—Р°РіСЂСѓР·РєР°...',
    sign_out: 'Р’С‹Р№С‚Рё',
    language: 'РЇР·С‹Рє',
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
  0x0402: 0x80,
  0x0403: 0x81,
  0x201a: 0x82,
  0x0453: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x20ac: 0x88,
  0x2030: 0x89,
  0x0409: 0x8a,
  0x2039: 0x8b,
  0x040a: 0x8c,
  0x040c: 0x8d,
  0x040b: 0x8e,
  0x040f: 0x8f,
  0x0452: 0x90,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x2122: 0x99,
  0x0459: 0x9a,
  0x203a: 0x9b,
  0x045a: 0x9c,
  0x045c: 0x9d,
  0x045b: 0x9e,
  0x045f: 0x9f,
  0x00a0: 0xa0,
  0x040e: 0xa1,
  0x045e: 0xa2,
  0x0408: 0xa3,
  0x00a4: 0xa4,
  0x0490: 0xa5,
  0x00a6: 0xa6,
  0x00a7: 0xa7,
  0x0401: 0xa8,
  0x00a9: 0xa9,
  0x0404: 0xaa,
  0x00ab: 0xab,
  0x00ac: 0xac,
  0x00ad: 0xad,
  0x00ae: 0xae,
  0x0407: 0xaf,
  0x00b0: 0xb0,
  0x00b1: 0xb1,
  0x0406: 0xb2,
  0x0456: 0xb3,
  0x0491: 0xb4,
  0x00b5: 0xb5,
  0x00b6: 0xb6,
  0x00b7: 0xb7,
  0x0451: 0xb8,
  0x2116: 0xb9,
  0x0454: 0xba,
  0x00bb: 0xbb,
  0x0458: 0xbc,
  0x0405: 0xbd,
  0x0455: 0xbe,
  0x0457: 0xbf,
};

function looksLikeBrokenCyrillic(input: string): boolean {
  const matches = input.match(/[\u0420\u0421][\u0400-\u04ff]/g);
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
  return /[\u0410-\u044f\u0401\u0451]/.test(decoded) ? decoded : input;
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
      t: (key: Key) => {
        const value = lang === 'uz' ? dict.uz[key] : dict.ru[key];
        return lang === 'ru' ? fixBrokenCyrillic(value) : value;
      },
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
