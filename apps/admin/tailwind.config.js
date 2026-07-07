import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Absolute, cwd-independent content paths — see the comment in
// postcss.config.js for why: deploy/Dockerfile.admin builds with the
// monorepo root as cwd, and relative content globs here resolve against
// cwd regardless of which tailwind.config.js file was explicitly loaded,
// silently producing zero matches (verified empirically — pointing
// postcss.config.js at this file's absolute path alone was NOT enough).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    extend: {
      // Design tokens for the SBGCloud admin redesign (docs/ADMIN_REDESIGN.md
      // §2, §10 step 2). Additive only — nothing here removes or replaces
      // Tailwind's own default theme, so every existing utility class
      // (text-gray-500, rounded, shadow, etc.) keeps working exactly as
      // before. Not consumed by any page yet (Phase 1: tokens exist,
      // nothing uses them until Phase 3 migrates each page).
      colors: {
        // Semantic aliases on top of Tailwind's built-in zinc/indigo/
        // emerald/amber/red/sky/violet scales — same hex values, just
        // named for what they mean in this app rather than which color
        // family they happen to come from. Confirmed zero existing usage
        // of `neutral-*`/`accent-*`/etc. classes anywhere in
        // apps/admin/src today, so adding these keys is a real no-op for
        // every currently rendered page.
        neutral: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        accent: {
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        success: '#059669',
        warning: '#d97706',
        danger: '#dc2626',
        // Small identifying marks only (nav icons, badges) — never a
        // page's dominant color, per §2.
        channel: {
          sellgram: '#059669',
          pos: '#0284c7',
          b2b: '#7c3aed',
        },
      },
      // The redesign's type scale (§2) — 14px base, not the browser
      // default 16px. Deliberately NOT named xs/sm/base/lg/xl/2xl:
      // those are Tailwind's own default fontSize keys, and overriding
      // them here would immediately change rendering wherever they're
      // already used today (confirmed: `text-sm` has exactly one existing
      // usage, apps/admin/src/pages/Reports.tsx, at Tailwind's default
      // 0.875rem/1.25rem — redefining `sm` in place would silently
      // change that line before Reports.tsx has actually been migrated).
      // Prefixed with `token-` so Phase 3 can adopt each size
      // consciously, page by page (`text-token-sm`), instead of an
      // implicit flag-day change the moment this config merges.
      fontSize: {
        'token-xs': ['12px', { lineHeight: '16px' }],
        'token-sm': ['13px', { lineHeight: '18px' }],
        'token-base': ['14px', { lineHeight: '20px' }],
        'token-lg': ['16px', { lineHeight: '24px' }],
        'token-xl': ['18px', { lineHeight: '26px' }],
        'token-2xl': ['22px', { lineHeight: '30px' }],
      },
      // Same reasoning as fontSize above: `rounded-lg` has one existing
      // usage (pages/Reports.tsx) at Tailwind's default 8px, while §2's
      // "lg" is 12px — redefining the bare `lg` key would change that
      // render today. Prefixed for the same reason and the same Phase 3
      // opt-in path (`rounded-token-lg`).
      borderRadius: {
        'token-sm': '6px',
        'token-md': '8px',
        'token-lg': '12px',
      },
      // shadow-sm has zero existing usage in apps/admin/src today
      // (confirmed), so defining Tailwind's own `shadow-sm` key directly
      // is a genuine no-op right now — no prefix needed, nothing to
      // collide with.
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
};
