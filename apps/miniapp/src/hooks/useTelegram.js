import { useEffect, useState } from 'react';
export function useTelegram() {
    const [webApp, setWebApp] = useState(null);
    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();
            setWebApp(tg);
        }
    }, []);
    return {
        webApp,
        user: webApp?.initDataUnsafe?.user,
        initData: webApp?.initData || '',
        colorScheme: webApp?.colorScheme || 'light',
    };
}
