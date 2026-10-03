import { useId } from 'react';
import { classNames } from '../../lib/format.js';

export default function Input({
  label,
  hint,
  error,
  required = false,
  className = '',
  id,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-xs font-semibold text-slate-600">
          {label} {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      <input
        id={inputId}
        required={required}
        aria-invalid={Boolean(error)}
        className={classNames(
          'w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-800',
          'placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100',
          error ? 'border-rose-400' : 'border-slate-300',
        )}
        {...rest}
      />
      {error ? <p className="mt-1 text-xs text-rose-500">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
