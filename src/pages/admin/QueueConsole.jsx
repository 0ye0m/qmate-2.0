import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Bell, CheckCheck, SkipForward, RefreshCcw, ScanLine, MonitorPlay, BadgeCheck, Coffee, Gauge,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../i18n/I18nProvider';
import { useNow, useEventBus } from '../../hooks/useEventBus';
import {
  getQueue, countersOf, waitingTokens, calledTokens, callNext, completeToken, skipToken,
  recallToken, markArrived, verifyPriority,
} from '../../services/queue/queueService';
import { adviseStaffing, peakPlanRows } from '../../services/prediction/staffingAdvisor';
import { storage } from '../../services/storage';
import ScannerModal, { parseQr, findTokenByCode } from '../../components/queue/ScannerModal';
import NowServingBanner from '../../components/queue/NowServingBanner';
import StatusPill from '../../components/common/StatusPill';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Card, { SectionTitle } from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import { describeError } from '../../utils/errors';
import { countdown } from '../../utils/format';
import { EVENTS } from '../../services/realtime/EventBus';
import { PRIORITY_META } from '../../utils/constants';

/** Counter console: multi-counter call/complete/skip/recall, QR check-in,
 *  fair-priority verification, grace timers, Erlang-C staffing plan. */
export default function QueueConsole() {
  const { queueId } = useParams();
  const { t } = useI18n();
  const now = useNow(1000);
  const user = useAuthStore((s) => s.user);
  const [queue, setQueue] = useState(null);
  const [counters, setCounters] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState([]);

  const reload = useCallback(async () => {
    try {
      const [q, cs, wt, live] = await Promise.all([
        getQueue(queueId),
        countersOf(queueId),
        waitingTokens(queueId),
        calledTokens(queueId),
      ]);
      const byId = new Map(live.map((tk) => [tk.id, tk]));
      setQueue(q);
      setCounters(cs.map((c) => ({ ...c, _token: c.currentTokenId ? byId.get(c.currentTokenId) || null : null })));
      setWaiting(wt);
      if (q) {
        const since = Date.now() - 7 * 86400000;
        const all = await storage.table('tokens').where('queueId').equals(queueId).toArray();
        const recent = all.filter((tk) => (tk.issuedAt || 0) >= since);
        setPlan(
          peakPlanRows(
            adviseStaffing({
              tokens: recent,
              avgServiceMin: q.avgServiceMin || 5,
              targetWaitMin: 10,
              window: { fromMin: 0, toMin: 24 * 60 },
            }),
            2
          )
        );
      }
    } catch (err) {
      console.error('[console] reload failed', err);
    }
  }, [queueId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEventBus(
    useCallback(
      (msg) => {
        if (!msg.payload || msg.payload.queueId === queueId) {
          // TOKEN_ISSUED / TOKEN_CANCELLED matter as much as counter actions:
          // remote joins/leaves from student tabs must refresh this list too.
          if ([EVENTS.TOKEN_ISSUED, EVENTS.TOKEN_CANCELLED, EVENTS.TOKEN_CALLED, EVENTS.TOKEN_SERVING, EVENTS.TOKEN_COMPLETED, EVENTS.TOKEN_SKIPPED, EVENTS.TOKEN_NO_SHOW, EVENTS.TOKEN_UPDATED, EVENTS.TOKEN_RECALLED, EVENTS.QUEUE_STATUS, EVENTS.QUEUE_PAUSED, EVENTS.QUEUE_RESUMED].includes(msg.type)) {
            reload();
          }
        }
      },
      [queueId, reload]
    )
  );

  const act = async (fn, successMsg) => {
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      await reload();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setBusy(false);
    }
  };

  const handleScanResult = async (_tokenId, raw) => {
    try {
      const parsedTokenId = parseQr(raw);
      let tk = parsedTokenId ? await (async () => {
        const live = await calledTokens(queueId);
        return live.find((x) => x.id === parsedTokenId);
      })() : null;
      if (!tk) {
        const live = await calledTokens(queueId);
        tk = findTokenByCode(live, raw);
      }
      if (!tk) throw new Error('TOKEN_NOT_FOUND');
      await markArrived(tk.id);
      toast.success(`${t('console.arrived')}: ${tk.code}`);
      await reload();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    }
  };

  if (!queue) {
    return (
      <div className="space-y-4">
        <Link to="/app/admin/queues" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline">
          <ArrowLeft size={15} aria-hidden="true" /> {t('admin.queues.title')}
        </Link>
        <EmptyState icon={MonitorPlay} title={t('common.loading')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/app/admin/queues" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline">
            <ArrowLeft size={15} aria-hidden="true" /> {t('admin.queues.title')}
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {queue.name} <StatusPill status={queue.status} kind="queue" />
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setScanOpen(true)}>
            <ScanLine size={16} aria-hidden="true" />
            {t('console.scan')}
          </Button>
          <Button size="lg" onClick={() => act(() => callNext(user, queueId, null))} loading={busy}>
            <Bell size={17} aria-hidden="true" />
            {t('console.callNext')}
          </Button>
        </div>
      </div>

      <NowServingBanner queueId={queueId} title={`${t('console.servingNow')} — ${queue.name}`} />

      <section>
        <SectionTitle title={t('console.counters')} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {counters.map((c) => {
            const tok = c._token;
            return (
              <Card key={c.id} className="flex flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">{c.label}</h3>
                  <Badge tone={c.status === 'open' ? 'green' : c.status === 'serving' ? 'violet' : 'slate'}>
                    {c.status === 'open' ? t('console.open') : c.status === 'serving' ? t('common.serving') : t('console.closed')}
                  </Badge>
                </div>

                {tok ? (
                  <div className="rounded-xl bg-brand-50 p-4 text-center dark:bg-brand-900/30">
                    <p className="text-4xl font-extrabold tracking-tight text-brand-700 dark:text-brand-300">#{tok.number}</p>
                    <p className="mt-1 font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{tok.code}</p>
                    {tok.status === 'called' && tok.graceUntil && (
                      <p className="mt-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                        {t('console.graceLeft', { t: countdown(tok.graceUntil - now) })}
                      </p>
                    )}
                    {tok.arrived && (
                      <Badge tone="green" className="mt-1.5">
                        {t('console.arrived')}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-slate-300 py-6 text-sm text-slate-400 dark:border-slate-600">
                    {c.status === 'closed' ? t('console.closed') : '—'}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {!c.currentTokenId && c.status === 'open' && (
                    <Button size="sm" className="flex-1" onClick={() => act(() => callNext(user, queueId, c.id))} loading={busy}>
                      <Bell size={13} aria-hidden="true" />
                      {t('console.callNext')}
                    </Button>
                  )}
                  {tok && (
                    <>
                      <Button
                        size="sm"
                        variant="success"
                        className="flex-1"
                        onClick={() => act(() => completeToken(user, tok.id))}
                        loading={busy}
                      >
                        <CheckCheck size={13} aria-hidden="true" />
                        {t('console.complete')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => act(() => skipToken(user, tok.id, 'manual'))}
                        disabled={busy}
                        aria-label={t('console.skip')}
                      >
                        <SkipForward size={13} aria-hidden="true" />
                      </Button>
                      {tok.status === 'called' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act(() => recallToken(user, tok.id))}
                          disabled={busy}
                          aria-label={t('console.recall')}
                        >
                          <RefreshCcw size={13} aria-hidden="true" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionTitle title={`${t('console.waitingList')} (${waiting.length})`} />
          <Card className="max-h-[480px] overflow-y-auto !p-0">
            {waiting.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">{t('console.noneWaiting')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {waiting.map((tk, idx) => (
                  <li key={tk.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-6 text-center text-xs font-bold text-slate-400">{idx + 1}</span>
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{tk.code}</span>
                    {tk.priority && tk.priority !== 'none' && (
                      <Badge tone={tk.priorityVerified ? 'violet' : 'amber'}>
                        {PRIORITY_META[tk.priority]?.label || tk.priority}
                        {tk.priorityVerified ? ' ✓' : ''}
                        {!tk.priorityVerified && (
                          <button
                            type="button"
                            onClick={() => act(() => verifyPriority(user, tk.id, true))}
                            className="ml-1 rounded-full bg-white/60 px-1.5 text-[10px] font-extrabold hover:bg-white"
                            aria-label={t('console.verify')}
                          >
                            <BadgeCheck size={11} className="inline" aria-hidden="true" />
                          </button>
                        )}
                      </Badge>
                    )}
                    {tk.stepAwayUntil > now && (
                      <Badge tone="slate">
                        <Coffee size={10} aria-hidden="true" /> {t('console.away')}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-slate-400">{tk.department}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section>
          <SectionTitle title={t('console.staffing')} />
          <Card>
            <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <Gauge size={13} aria-hidden="true" />
              M/M/c · Erlang-C · 7d
            </p>
            {plan.length === 0 ? (
              <p className="text-sm text-slate-400">—</p>
            ) : (
              <ul className="space-y-2">
                {plan.map((row) => (
                  <li key={row.hour} className="rounded-xl bg-brand-50 p-3 dark:bg-brand-900/30">
                    <p className="text-sm font-extrabold text-brand-800 dark:text-brand-200">
                      {row.hour}:00 — {row.recommendedCounters} {t('common.counter')}
                    </p>
                    <p className="text-xs text-brand-700/70 dark:text-brand-300/70">
                      λ≈{row.arrivalsPerHour}/h · util {row.utilization}%
                      {row.predictedWaitMin != null ? ` · wait ≈${row.predictedWaitMin}m` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <ScannerModal open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScanResult} />
    </div>
  );
}
