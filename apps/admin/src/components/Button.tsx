import React, { useRef, useEffect, useCallback } from 'react';

// Native click button - bypasses React synthetic events
// Fixes dual-React issue in pnpm monorepo
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: (e?: MouseEvent) => void;
  children: React.ReactNode;
  // Both optional, no default value on purpose: every existing call site
  // (pages/Orders.tsx, pages/Billing.tsx) only ever passes `className`
  // with the legacy `sg-btn primary/ghost/danger` CSS classes today. If
  // `variant`/`size` defaulted to something, those pages would silently
  // pick up new token-based classes alongside their existing ones the
  // moment this file merges — a real visual change on already-rendered
  // pages, which contradicts "these components are unused by any page
  // yet" (docs/ADMIN_REDESIGN.md §10 step 4). Omitting them keeps
  // rendering byte-for-byte identical to today for every current caller;
  // only a caller that explicitly opts in gets the new look.
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent-600 text-white border-transparent hover:bg-accent-500 active:bg-accent-700',
  secondary: 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50',
  ghost: 'bg-transparent text-neutral-700 border-transparent hover:bg-neutral-100',
  danger: 'bg-white text-danger border-danger/40 hover:bg-danger/10',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-token-xs px-2.5 py-1.5 rounded-token-sm',
  md: 'text-token-sm px-3.5 py-2 rounded-token-md',
  lg: 'text-token-base px-5 py-2.5 rounded-token-md',
};

// Shared regardless of variant/size — only applied when at least one of
// them is actually requested (see the `variant || size` guard below), for
// the same backward-compatibility reason as above.
const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 font-semibold border transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-600 focus-visible:outline-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

export default function Button({ onClick, children, className, disabled, variant, size, ...rest }: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const handlerRef = useRef(onClick);
  handlerRef.current = onClick;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      if (!el.disabled && handlerRef.current) {
        handlerRef.current(e);
      }
    };
    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, []);

  const tokenClasses = variant || size
    ? [BASE_CLASSES, variant && VARIANT_CLASSES[variant], size && SIZE_CLASSES[size]].filter(Boolean).join(' ')
    : '';
  const finalClassName = [tokenClasses, className].filter(Boolean).join(' ') || undefined;

  return (
    <button ref={ref} className={finalClassName} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
