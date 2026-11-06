import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { checklistFor } from '../../services/ai/aiFeatures';
import Skeleton from '../common/Skeleton';
import Badge from '../common/Badge';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Pre-visit document checklist: admin-required docs + AI-enriched tips
 * (local heuristic fallback). Students tick items to acknowledge.
 */
export default function DocumentChecklist({ queue, lang = 'en' }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [checked, setChecked] = useState({});

  useEffect(() => {
    let alive = true;
    setData(null);
    setChecked({});
    checklistFor(queue, lang)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch(() => {
        if (alive) setData({ items: queue.requiredDocs.map((n) => ({ name: n, tip: '', mandatory: true })), mode: 'fallback' });
      });
    return () => {
      alive = false;
    };
  }, [queue.id, queue.requiredDocs, lang]);

  const items = useMemo(() => data?.items || [], [data]);

  if (!data) {
    return (
      <div className="space-y-3 py-2" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-3/4" />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('queues.checklistSub')}</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={`${item.name}-${i}`}>
            <button
              type="button"
              onClick={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
              aria-pressed={!!checked[i]}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                checked[i]
                  ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-900/20'
                  : 'border-slate-200 bg-white hover:border-brand-300 dark:border-slate-600 dark:bg-slate-800'
              }`}
            >
              {checked[i] ? (
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />
              ) : (
                <Circle size={20} className="mt-0.5 shrink-0 text-slate-300 dark:text-slate-500" aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{item.name}</span>
                  {item.mandatory ? (
                    <Badge tone="rose">required</Badge>
                  ) : (
                    <Badge tone="slate">optional</Badge>
                  )}
                </span>
                {item.tip && <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{item.tip}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <Sparkles size={12} aria-hidden="true" />
        {data.mode === 'online' ? t('ai.modeOnline') : t('ai.modeFallback')}
      </p>
      <p className="sr-only" aria-live="polite">
        Tick all items to continue
      </p>
    </div>
  );
}
