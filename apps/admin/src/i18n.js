import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo, useState } from 'react';
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
        system_admin: 'Системный админ',
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
        system_admin: 'Tizim admini',
        loading: 'Yuklanmoqda...',
        sign_out: 'Chiqish',
        language: 'Til',
    },
};
const I18nContext = createContext(null);
export function AdminI18nProvider({ children }) {
    const [lang, setLangState] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'ru' || saved === 'uz')
            return saved;
        return 'ru';
    });
    const setLang = (next) => {
        setLangState(next);
        localStorage.setItem(STORAGE_KEY, next);
        document.documentElement.lang = next;
    };
    const value = useMemo(() => ({
        lang,
        setLang,
        t: (key) => dict[lang][key],
        tr: (ru, uz) => (lang === 'uz' ? uz : ru),
    }), [lang]);
    return _jsx(I18nContext.Provider, { value: value, children: children });
}
export function useAdminI18n() {
    const ctx = useContext(I18nContext);
    if (!ctx)
        throw new Error('useAdminI18n must be used inside AdminI18nProvider');
    return ctx;
}
