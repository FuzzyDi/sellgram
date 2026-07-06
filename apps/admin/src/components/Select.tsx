import React, { useId } from 'react';

// Same label/error/help-text layout as Input.tsx, wrapping the native
// <select> (docs/ADMIN_REDESIGN.md §5).
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  error?: string;
  helpText?: React.ReactNode;
  children: React.ReactNode;
}

export default function Select({ label, error, helpText, className, id, children, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const descId = error || helpText ? `${selectId}-desc` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-token-sm font-medium text-neutral-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={!!error}
        aria-describedby={descId}
        className={[
          'w-full rounded-token-md border px-3 py-2 text-token-sm text-neutral-800 bg-white',
          'focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500',
          error ? 'border-danger' : 'border-neutral-300',
          className,
        ].filter(Boolean).join(' ')}
        {...rest}
      >
        {children}
      </select>
      {(error || helpText) && (
        <p id={descId} className={`text-token-xs ${error ? 'text-danger' : 'text-neutral-500'}`}>
          {error || helpText}
        </p>
      )}
    </div>
  );
}
