import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useAdminI18n } from '../i18n';
export default function Login({ onLogin, onRegister }) {
    const { tr, lang, setLang } = useAdminI18n();
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [tenantName, setTenantName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const slugify = (s) => s.toLowerCase().replace(/[^a-zа-яёa-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (mode === 'login') {
                await onLogin(email, password);
            }
            else {
                if (!name || !tenantName) {
                    setError(tr('Заполните все поля', "Barcha maydonlarni to'ldiring"));
                    setLoading(false);
                    return;
                }
                await onRegister({ email, password, name, tenantName, tenantSlug: slugify(tenantName) });
            }
        }
        catch (err) {
            setError(err.message || tr('Ошибка', 'Xatolik'));
        }
        setLoading(false);
    };
    return (_jsxs("div", { style: { minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.2fr 1fr', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 48%, #0f172a 100%)' }, children: [_jsxs("div", { style: { padding: '40px clamp(20px, 6vw, 64px)', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }, children: [_jsxs("h1", { style: { fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800, letterSpacing: -1 }, children: ["Sell", _jsx("span", { style: { color: '#00b96b' }, children: "Gram" })] }), _jsxs("p", { style: { fontSize: 'clamp(16px, 2vw, 20px)', marginTop: 16, color: '#94a3b8', lineHeight: 1.6 }, children: [tr('Telegram-магазин за 5 минут.', 'Telegram do‘koni 5 daqiqada.'), _jsx("br", {}), tr('Запустите продажи через Telegram.', 'Telegram orqali savdoni boshlang.')] }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 28 }, children: [tr('Каталог товаров', 'Mahsulot katalogi'), tr('Онлайн-заказы', 'Onlayn buyurtmalar'), tr('Программа лояльности', 'Loyallik dasturi'), tr('Аналитика', 'Analitika')].map((f) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 14 }, children: [_jsx("span", { style: { color: '#00b96b' }, children: "\u2713" }), " ", f] }, f))) })] }), _jsx("div", { style: { padding: '20px clamp(14px, 3vw, 28px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsxs("div", { style: { width: '100%', maxWidth: 460, background: '#fff', borderRadius: 24, padding: '26px clamp(18px,3vw,34px)', boxShadow: '0 25px 50px rgba(0,0,0,0.28)' }, children: [_jsx("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, children: _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("button", { onClick: () => setLang('ru'), style: { border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, background: lang === 'ru' ? '#0f172a' : '#fff', color: lang === 'ru' ? '#fff' : '#334155' }, children: "RU" }), _jsx("button", { onClick: () => setLang('uz'), style: { border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, background: lang === 'uz' ? '#0f172a' : '#fff', color: lang === 'uz' ? '#fff' : '#334155' }, children: "UZ" })] }) }), _jsx("h2", { style: { fontSize: 24, fontWeight: 700, marginBottom: 8 }, children: mode === 'login' ? tr('Вход в панель', 'Panelga kirish') : tr('Создать магазин', "Do'kon yaratish") }), _jsx("p", { style: { color: '#6b7280', fontSize: 14, marginBottom: 20 }, children: mode === 'login' ? tr('Войдите для управления магазином', "Do'konni boshqarish uchun kiring") : tr('Бесплатная регистрация за 30 секунд', "30 soniyada bepul ro'yxatdan o'ting") }), error && _jsx("div", { style: { background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }, children: error }), _jsxs("form", { onSubmit: handleSubmit, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 }, children: [mode === 'register' && (_jsxs(_Fragment, { children: [_jsx(Field, { label: tr('Название магазина', "Do'kon nomi"), children: _jsx("input", { value: tenantName, onChange: (e) => setTenantName(e.target.value), placeholder: tr('Мой магазин', "Mening do'konim"), style: inputStyle }) }), _jsx(Field, { label: tr('Ваше имя', 'Ismingiz'), children: _jsx("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: tr('Иван Иванов', 'Ali Valiyev'), style: inputStyle }) })] })), _jsx(Field, { label: "Email", children: _jsx("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "email@example.com", style: inputStyle }) }), _jsx(Field, { label: tr('Пароль', 'Parol'), children: _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: tr('Минимум 6 символов', 'Kamida 6 ta belgi'), style: inputStyle }) })] }), _jsx("button", { type: "submit", disabled: loading, style: { width: '100%', padding: '12px', marginTop: 18, borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', background: 'linear-gradient(135deg, #00875a, #00b96b)', color: '#fff', opacity: loading ? 0.6 : 1 }, children: loading ? '...' : mode === 'login' ? tr('Войти', 'Kirish') : tr('Создать магазин', "Do'kon yaratish") })] }), _jsx("p", { style: { textAlign: 'center', marginTop: 18, fontSize: 13, color: '#6b7280' }, children: mode === 'login' ? (_jsxs(_Fragment, { children: [tr('Нет аккаунта?', "Akkauntingiz yo'qmi?"), " ", _jsx("button", { onClick: () => { setMode('register'); setError(''); }, style: linkBtn, children: tr('Зарегистрироваться', "Ro'yxatdan o'tish") })] })) : (_jsxs(_Fragment, { children: [tr('Уже есть аккаунт?', 'Akkauntingiz bormi?'), " ", _jsx("button", { onClick: () => { setMode('login'); setError(''); }, style: linkBtn, children: tr('Войти', 'Kirish') })] })) })] }) })] }));
}
function Field({ label, children }) {
    return (_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }, children: label }), children] }));
}
const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
};
const linkBtn = {
    color: '#3b82f6',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 500,
};
