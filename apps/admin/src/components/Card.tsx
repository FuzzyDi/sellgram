import React from 'react';

// Border-not-shadow container (docs/ADMIN_REDESIGN.md §2/§5) — replaces
// the ad hoc `sg-card` CSS class's shadow-based look for pages that
// migrate onto the new token system. Default padding, overridable via
// `style` (guaranteed to win over the class) or `className` (works for
// most overrides, but two same-specificity utility classes racing for
// the same property is a standard Tailwind caveat, not something this
// component tries to solve).
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={['border border-neutral-200 rounded-token-lg bg-white p-4', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
