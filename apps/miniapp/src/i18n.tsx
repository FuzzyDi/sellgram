import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'ru' | 'uz';

const STORAGE_KEY = 'sellgram_miniapp_lang';

interface MiniI18nValue {
  lang: Lang;
  locale: string;
  setLang: (next: Lang) => void;
  tr: (ru: string, uz: string) => string;
}

const MiniI18nContext = createContext<MiniI18nValue | null>(null);

function resolveInitialLang(defaultLang: Lang): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'ru' || saved === 'uz') return saved;
  return defaultLang;
}

export function MiniI18nProvider({
  children,
  defaultLang,
}: {
  children: React.ReactNode;
  defaultLang: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(() => resolveInitialLang(defaultLang));

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== 'ru' && saved !== 'uz') {
      setLangState(defaultLang);
      document.documentElement.lang = defaultLang;
    }
  }, [defaultLang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  };

  const value = useMemo<MiniI18nValue>(() => ({
    lang,
    locale: lang === 'uz' ? 'uz-UZ' : 'ru-RU',
    setLang,
    tr: (ru: string, uz: string) => (lang === 'uz' ? uz : ru),
  }), [lang]);

  return <MiniI18nContext.Provider value={value}>{children}</MiniI18nContext.Provider>;
}

export function useMiniI18n() {
  const ctx = useContext(MiniI18nContext);
  if (!ctx) throw new Error('useMiniI18n must be used inside MiniI18nProvider');
  return ctx;
}
