import { useEffect } from 'react';

/**
 * Shows the Telegram native BackButton while the component is mounted
 * and calls `onBack` when the user taps it.
 */
export function useTelegramBackButton(onBack: () => void) {
  useEffect(() => {
    const btn = window.Telegram?.WebApp?.BackButton;
    if (!btn) return;

    btn.show();
    btn.onClick(onBack);

    return () => {
      btn.offClick(onBack);
      btn.hide();
    };
  }, [onBack]);
}
