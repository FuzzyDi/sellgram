import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
const STORAGE_KEY = 'sellgram_miniapp_lang';
const MiniI18nContext = createContext(null);
function resolveInitialLang(defaultLang) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ru' || saved === 'uz')
        return saved;
    return defaultLang;
}
export function MiniI18nProvider({ children, defaultLang, }) {
    const [lang, setLangState] = useState(() => resolveInitialLang(defaultLang));
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== 'ru' && saved !== 'uz') {
            setLangState(defaultLang);
            document.documentElement.lang = defaultLang;
        }
    }, [defaultLang]);
    const setLang = (next) => {
        setLangState(next);
        localStorage.setItem(STORAGE_KEY, next);
        document.documentElement.lang = next;
    };
    const value = useMemo(() => ({
        lang,
        locale: lang === 'uz' ? 'uz-UZ' : 'ru-RU',
        setLang,
        tr: (ru, uz) => (lang === 'uz' ? uz : ru),
    }), [lang]);
    return _jsx(MiniI18nContext.Provider, { value: value, children: children });
}
export function useMiniI18n() {
    const ctx = useContext(MiniI18nContext);
    if (!ctx)
        throw new Error('useMiniI18n must be used inside MiniI18nProvider');
    return ctx;
}
