export default function StatCard({ label, value, sub, icon: Icon, tone = 'teal' }) {
  const tones = {
    teal: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  };
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className={`rounded-xl p-2 ${tones[tone]}`} aria-hidden="true">
            <Icon size={18} />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white">{value}</p>
          {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
