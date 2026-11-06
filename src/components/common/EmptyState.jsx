export default function EmptyState({ icon: Icon, title, sub, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center dark:border-slate-600 dark:bg-slate-800/40">
      {Icon && (
        <div className="mb-3 rounded-2xl bg-brand-100 p-3 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
          <Icon size={26} aria-hidden="true" />
        </div>
      )}
      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h3>
      {sub && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
