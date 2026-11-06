export function Skeleton({ className = 'h-4 w-full' }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-slate-200/80 dark:bg-slate-700/50 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/10" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-800/70">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="mt-3 h-3 w-3/4" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}

export default Skeleton;
