import { Leaf } from 'lucide-react';

/** Full-screen boot / suspense loader. */
export function BootLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 dark:bg-slate-900" role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-4">
        <span className="grid h-16 w-16 animate-pulseSoft place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl">
          <Leaf size={30} aria-hidden="true" />
        </span>
        <div className="h-1.5 w-36 overflow-hidden rounded-full bg-brand-100 dark:bg-slate-700">
          <div className="h-full w-1/2 animate-pulseSoft rounded-full bg-brand-500" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Q-Mate 2.0</p>
      </div>
    </div>
  );
}

export default BootLoader;
