import React from 'react';

// Generalized status pill (docs/ADMIN_REDESIGN.md §5).
//
// Note on precedent: the doc's §5 points at the existing `.sg-pill` CSS
// class (index.css) as the thing to generalize. Checked its actual real
// usage first (as instructed) — `.sg-pill` (Settings.tsx's tab buttons)
// is really a binary active/inactive tab selector, not a color-variant
// status indicator. The real match for "status pill with a color
// variant" is `.sg-badge` (used in Products.tsx for the isActive/
// inactive product status: green background+text vs. gray). This
// component's variant semantics follow that actual precedent; the fully
// rounded pill shape is shared by both existing classes either way.
export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-accent-600/10 text-accent-600',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-token-xs font-semibold',
        VARIANT_CLASSES[variant],
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </span>
  );
}
