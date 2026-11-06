export function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ title, sub, right }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export default Card;
