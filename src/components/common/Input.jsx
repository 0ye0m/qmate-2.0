import { forwardRef } from 'react';

const base =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-white dark:placeholder-slate-500';

export const Input = forwardRef(function Input({ label, hint, error, className = '', id, ...rest }, ref) {
  const inputId = id || rest.name || label;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        className={`${base} ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30' : ''}`}
        {...rest}
      />
      {hint && !error && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
});

export const Select = forwardRef(function Select({ label, hint, options = [], className = '', id, children, ...rest }, ref) {
  const selectId = id || rest.name || label;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </label>
      )}
      <select ref={ref} id={selectId} className={base} {...rest}>
        {children ??
          options.map((o) => (
            <option key={String(o.value)} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ label, hint, className = '', id, rows = 3, ...rest }, ref) {
  const taId = id || rest.name || label;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={taId} className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </label>
      )}
      <textarea ref={ref} id={taId} rows={rows} className={base} {...rest} />
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
});
