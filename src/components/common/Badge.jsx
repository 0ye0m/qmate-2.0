const TONES = {
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teal: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
};

export default function Badge({ tone = 'slate', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone] || TONES.slate} ${className}`}
    >
      {children}
    </span>
  );
}

export const QUEUE_TONE = {
  active: 'green',
  inactive: 'slate',
  scheduled: 'violet',
  paused: 'amber',
  completed: 'teal',
};

export const TOKEN_TONE = {
  waiting: 'teal',
  called: 'amber',
  serving: 'violet',
  completed: 'green',
  skipped: 'slate',
  'no-show': 'rose',
  cancelled: 'slate',
};
