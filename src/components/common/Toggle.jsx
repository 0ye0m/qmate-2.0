export default function Toggle({ checked, onChange, label, id, disabled = false }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 select-none">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-slate-900 ${
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      {label && <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>}
    </label>
  );
}
