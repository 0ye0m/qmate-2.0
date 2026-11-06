import { Users, Clock3, FileText, ArrowRight, Leaf } from 'lucide-react';
import Badge, { QUEUE_TONE } from '../common/Badge';
import Button from '../common/Button';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Live queue card: ETA ±confidence band, slots meter, docs count, best
 * low-crowd window (peak flattener), and the join CTA.
 */
export default function QueueCard({ queue, stat, bestWindow, disabledReason, onJoin, onConsole }) {
  const { t } = useI18n();
  const status = queue.status;
  const used = stat?.slotsUsed ?? 0;
  const pct = Math.min(100, Math.round((used / queue.maxSlots) * 100));
  const joinable = status === 'active' && !disabledReason;

  return (
    <div className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700/60 dark:bg-slate-800/70">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-900 dark:text-white">{queue.name}</h3>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            {queue.department}
          </p>
        </div>
        <Badge tone={QUEUE_TONE[status] || 'slate'}>{t(`common.${status}`)}</Badge>
      </div>

      {queue.description && (
        <p className="mb-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{queue.description}</p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <Clock3 size={14} aria-hidden="true" />
          {stat?.etaMin != null ? t('queues.eta', { eta: stat.etaMin }) : '—'}
          {stat?.bandMin ? <span className="font-normal opacity-70">±{stat.bandMin}</span> : null}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
          <Users size={14} aria-hidden="true" />
          {used}/{queue.maxSlots}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
          <FileText size={14} aria-hidden="true" />
          {queue.requiredDocs.length}
        </span>
      </div>

      <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('queues.slotsLeft', { n: queue.maxSlots - used })}
        />
      </div>
      <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
        {used >= queue.maxSlots ? t('queues.full') : t('queues.slotsLeft', { n: queue.maxSlots - used })}
      </p>

      {bestWindow && (
        <p className="mb-3 inline-flex items-center gap-1.5 self-start rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          <Leaf size={12} aria-hidden="true" />
          {bestWindow.from}–{bestWindow.to} · ~{bestWindow.reductionPct}% shorter
        </p>
      )}

      <div className="mt-auto flex gap-2 pt-2">
        <Button
          className="flex-1"
          disabled={!joinable}
          onClick={() => onJoin?.(queue)}
          title={disabledReason || undefined}
        >
          {joinable ? (
            <>
              {t('queues.join')}
              <ArrowRight size={15} aria-hidden="true" />
            </>
          ) : (
            disabledReason || t(`common.${status}`)
          )}
        </Button>
        {onConsole && (
          <Button variant="secondary" onClick={() => onConsole(queue)}>
            {t('common.view')}
          </Button>
        )}
      </div>
    </div>
  );
}
