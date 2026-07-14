import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, Boxes, Users, BarChart2, Settings as SettingsIcon, CreditCard, Briefcase, ChevronDown, ChevronUp, ShoppingCart, Truck, Tag, FileText, HelpCircle, type LucideIcon,
} from 'lucide-react';
import { useAdminI18n, type Key } from '../i18n';

interface NavLink {
  to: string;
  label: Key;
  perm?: string;
  icon: LucideIcon;
}

// Telegram's own brand mark has no Tabler/Lucide equivalent (lucide-react
// ships outline icons only, no brand set) — reused as a minimal inline SVG,
// same mark already used in apps/landing/index.html for the same purpose.
function TelegramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.93 6.71l-1.68 7.92c-.12.56-.46.69-.93.43l-2.57-1.89-1.24 1.19c-.14.14-.25.25-.51.25l.18-2.6 4.7-4.25c.2-.18-.04-.28-.32-.1L7.4 14.61 4.87 13.8c-.55-.17-.56-.55.12-.82l9.67-3.73c.46-.17.86.11.27.46z"
        fill="currentColor"
      />
    </svg>
  );
}

// Two-level IA (docs/ADMIN_REDESIGN.md §3): Workspace (channel-agnostic)
// and Sales channels (per-channel — Sellgram, POS (Phase 3 step 5), and
// B2B/Опт (Phase 3 step 6)). Icon substitution note: the brief asked for Tabler outline
// icons (ti-layout-dashboard etc.) — this app has no Tabler dependency at
// all, only lucide-react (already used throughout the old App.tsx
// Sidebar). Adding a whole new icon library for a Phase 2 shell felt like
// unwarranted scope for zero visual gain when lucide-react already ships
// equivalents with near-identical names; substituted 1:1 (LayoutDashboard,
// Package, Boxes, Users, BarChart2, Settings) plus one inline SVG for the
// Telegram brand mark, which neither library provides.
const WORKSPACE_LINKS: NavLink[] = [
  { to: '/', label: 'dashboard', icon: LayoutDashboard },
  { to: '/products', label: 'catalog', perm: 'manageCatalog', icon: Package },
  { to: '/stock', label: 'stock', perm: 'manageCatalog', icon: Boxes },
  { to: '/procurement', label: 'procurement', perm: 'manageCatalog', icon: ShoppingCart },
  { to: '/suppliers', label: 'suppliers', perm: 'manageCatalog', icon: Truck },
  { to: '/categories', label: 'categories', perm: 'manageCatalog', icon: Tag },
  { to: '/customers', label: 'customers', perm: 'manageCustomers', icon: Users },
  { to: '/reports', label: 'reports', perm: 'viewReports', icon: BarChart2 },
  { to: '/billing', label: 'billing', perm: 'manageBilling', icon: CreditCard },
  { to: '/audit-log', label: 'audit_log', perm: 'manageSettings', icon: FileText },
  { to: '/help', label: 'help', icon: HelpCircle },
  { to: '/settings', label: 'team_settings', icon: SettingsIcon },
];

// Sellgram's own screens (docs/ADMIN_REDESIGN.md §3) — exact paths from
// App.tsx's route table. Note /payments, not /payment-methods — that's
// the actual registered route for PaymentMethods.tsx.
const SELLGRAM_LINKS: { to: string; label: Key }[] = [
  { to: '/orders', label: 'orders' },
  { to: '/promo-codes', label: 'promo_codes' },
  { to: '/banners', label: 'banners' },
  { to: '/broadcasts', label: 'broadcasts' },
  { to: '/payments', label: 'payments' },
  { to: '/reviews', label: 'reviews' },
];

interface SidebarProps {
  tenantName?: string;
  permissions: Record<string, boolean>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({ tenantName, permissions, mobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useAdminI18n();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;

  const visibleWorkspaceLinks = WORKSPACE_LINKS.filter((l) => !l.perm || Boolean(permissions[l.perm]));

  const [sellgramOpen, setSellgramOpen] = useState(() =>
    SELLGRAM_LINKS.some((link) => pathname.startsWith(link.to)),
  );

  function go(to: string) {
    navigate(to);
    onCloseMobile();
  }

  function isActive(to: string) {
    return to === '/' ? pathname === '/' : pathname.startsWith(to);
  }

  function navItemClass(active: boolean) {
    return [
      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-token-md text-token-sm font-semibold text-left transition-colors',
      active
        ? 'bg-accent-600 text-white'
        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800',
    ].join(' ');
  }

  // Same active/hover treatment as navItemClass, scaled down for a
  // sub-nav row: smaller text, deeper left indent, no icon slot.
  function subNavItemClass(active: boolean) {
    return [
      'w-full flex items-center pl-8 pr-2.5 py-1.5 rounded-token-md text-token-xs font-semibold text-left transition-colors',
      active
        ? 'bg-accent-600 text-white'
        : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
    ].join(' ');
  }

  return (
    <aside
      className={[
        // Reuses the existing .sg-sidebar off-canvas/overlay CSS
        // (index.css, @media max-width:768px) — those rules only set
        // position/left/box-shadow, no colors, so it composes cleanly
        // with the Tailwind background/border classes here.
        'sg-sidebar w-[220px] shrink-0 h-screen sticky top-0 flex flex-col',
        'bg-white border-r border-neutral-200',
        mobileOpen ? 'open' : '',
      ].join(' ')}
    >
      {/* Branding */}
      <div className="px-3.5 pt-4 pb-3 border-b border-neutral-200">
        <span className="text-token-lg font-semibold text-neutral-800 tracking-tight">SBGCloud</span>
        <p className="mt-1 text-token-xs font-semibold text-neutral-500 truncate">{tenantName || '—'}</p>
      </div>

      {/* Workspace */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <p className="px-2.5 mb-1.5 text-token-xs font-semibold uppercase tracking-wide text-neutral-400">
          {t('workspace')}
        </p>
        <div className="flex flex-col gap-0.5 mb-4">
          {visibleWorkspaceLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.to);
            return (
              <button key={link.to} onClick={() => go(link.to)} className={navItemClass(active)}>
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                {t(link.label)}
              </button>
            );
          })}
        </div>

        {/* Sales channels — Sellgram + POS + B2B (docs/ADMIN_REDESIGN.md
            §3/§10 step 4/5/6). */}
        <p className="px-2.5 mb-1.5 text-token-xs font-semibold uppercase tracking-wide text-neutral-400">
          {t('sales_channels')}
        </p>
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => setSellgramOpen((open) => !open)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-token-sm font-semibold text-left text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800 rounded-token-md transition-colors"
          >
            <span className="text-channel-sellgram">
              <TelegramIcon size={16} />
            </span>
            <span className="flex-1">Sellgram</span>
            {sellgramOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {sellgramOpen && SELLGRAM_LINKS.map((link) => (
            <button key={link.to} onClick={() => go(link.to)} className={subNavItemClass(isActive(link.to))}>
              {t(link.label)}
            </button>
          ))}
          <button onClick={() => go('/pos/devices')} className={navItemClass(isActive('/pos'))}>
            <span className="text-channel-pos">
              <CreditCard size={16} strokeWidth={isActive('/pos') ? 2.2 : 1.8} />
            </span>
            {t('pos')}
          </button>
          <button onClick={() => go('/b2b/counterparties')} className={navItemClass(isActive('/b2b'))}>
            <span className="text-channel-b2b">
              <Briefcase size={16} strokeWidth={isActive('/b2b') ? 2.2 : 1.8} />
            </span>
            {t('b2b')}
          </button>
        </div>
      </nav>
    </aside>
  );
}
