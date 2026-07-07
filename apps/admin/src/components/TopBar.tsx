import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, ChevronDown } from 'lucide-react';
import { useAdminI18n, type Key } from '../i18n';

// Simple path → title map (brief's own suggestion, docs/ADMIN_REDESIGN.md
// §5) — deliberately per-page, not per-nav-group: visiting /categories
// says "Categories", not the Sidebar's consolidated "Catalog" label, since
// the title should reflect the actual page, not its nav grouping.
const TITLE_KEYS: Record<string, Key> = {
  '/': 'dashboard',
  '/orders': 'orders',
  '/products': 'products',
  '/categories': 'categories',
  '/customers': 'customers',
  '/payments': 'payments',
  '/procurement': 'procurement',
  '/stock': 'stock',
  '/suppliers': 'suppliers',
  '/broadcasts': 'broadcasts',
  '/reviews': 'reviews',
  '/reports': 'reports',
  '/settings': 'team_settings',
  '/billing': 'plans',
  '/help': 'help',
};

// Not in the shared i18n dict (same tr()-inline pattern the old App.tsx
// Sidebar already used for these three) — kept local since they're not
// nav items, just extra routed pages needing a title.
const TITLE_TR: Record<string, [string, string]> = {
  '/promo-codes': ['Промокоды', 'Promokodlar'],
  '/banners': ['Баннеры', 'Bannerlar'],
  '/audit-log': ['Журнал', 'Jurnal'],
};

interface TopBarProps {
  userName?: string;
  userEmail?: string;
  onLogout: () => void;
  onOpenMobileSidebar: () => void;
}

export default function TopBar({ userName, userEmail, onLogout, onOpenMobileSidebar }: TopBarProps) {
  const { t, tr, lang, setLang } = useAdminI18n();
  const pathname = useLocation().pathname;
  const [menuOpen, setMenuOpen] = useState(false);

  const titleKey = TITLE_KEYS[pathname];
  const titleTr = TITLE_TR[pathname];
  const title = titleKey ? t(titleKey) : titleTr ? tr(titleTr[0], titleTr[1]) : '';

  return (
    <header className="sg-shell-topbar h-[52px] shrink-0 flex items-center justify-between gap-3 px-4 border-b border-neutral-200 bg-white">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="sg-topbar-burger hidden text-neutral-500 hover:text-neutral-800"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-token-lg font-semibold text-neutral-800 truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="inline-flex border border-neutral-200 rounded-token-sm p-0.5 gap-0.5">
          {(['ru', 'uz'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={[
                'px-2 py-1 rounded-token-sm text-token-xs font-semibold transition-colors',
                lang === l ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:bg-neutral-100',
              ].join(' ')}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 text-token-sm font-semibold text-neutral-700 hover:text-neutral-900"
          >
            <span className="max-w-[160px] truncate">{userName || userEmail || '—'}</span>
            <ChevronDown size={14} strokeWidth={2} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-neutral-200 rounded-token-md shadow-sm z-20 py-1">
                {userEmail && (
                  <div className="px-3 py-1.5 text-token-xs text-neutral-500 truncate border-b border-neutral-200 mb-1">
                    {userEmail}
                  </div>
                )}
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full text-left px-3 py-1.5 text-token-sm font-semibold text-danger hover:bg-danger/5"
                >
                  {t('sign_out')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
