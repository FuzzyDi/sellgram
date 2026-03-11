import React, { useRef, useEffect } from 'react';

interface NativeButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export default function NativeButton({ onClick, children, className = '', disabled = false, type = 'button' }: NativeButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      e.preventDefault();
      if (!disabled) onClick();
    };
    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [onClick, disabled]);

  return (
    <button ref={ref} type={type} disabled={disabled} className={className}>
      {children}
    </button>
  );
}
