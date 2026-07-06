import React, { useId } from 'react';

// Consistent label/error/help-text layout (docs/ADMIN_REDESIGN.md §5)
// wrapping the native <input>, styled with the token classes from
// tailwind.config.js.
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
  helpText?: React.ReactNode;
}

export default function Input({ label, error, helpText, className, id, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = error || helpText ? `${inputId}-desc` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-token-sm font-medium text-neutral-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={descId}
        className={[
          'w-full rounded-token-md border px-3 py-2 text-token-sm text-neutral-800',
          'placeholder:text-neutral-400 bg-white',
          'focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500',
          error ? 'border-danger' : 'border-neutral-300',
          className,
        ].filter(Boolean).join(' ')}
        {...rest}
      />
      {(error || helpText) && (
        <p id={descId} className={`text-token-xs ${error ? 'text-danger' : 'text-neutral-500'}`}>
          {error || helpText}
        </p>
      )}
    </div>
  );
}
