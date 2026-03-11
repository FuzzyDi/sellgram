import React, { useRef, useEffect, useCallback } from 'react';

// Native click button - bypasses React synthetic events
// Fixes dual-React issue in pnpm monorepo
interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: (e?: MouseEvent) => void;
  children: React.ReactNode;
}

export default function Button({ onClick, children, className, disabled, ...rest }: ButtonProps) {
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

  return (
    <button ref={ref} className={className} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
