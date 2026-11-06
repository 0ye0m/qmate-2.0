import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Ticket, Leaf, Clock, Users, Megaphone, CalendarClock, Trophy, Timer,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useQueueStore } from '../../store/queueStore';
import { useI18n } from '../../i18n/I18nProvider';
import { useLiveTokenInfo } from '../../hooks/useLiveTokenInfo';
import { userStats } from '../../services/green/greenEngine';
import { localizedText } from '../../services/queue/announcementService';
import StatCard from '../../components/common/StatCard';
import Card, { SectionTitle } from '../../components/common/Card';
import QueueCard from '../../components/queue/QueueCard';
import EmptyState from '../../components/common/EmptyState';
import { fmtMinutes, fmtDateTime } from '../../utils/format';
import { BADGES } from '../../utils/constants';

function MiniLiveToken({ token }) {
  const info = useLiveTokenInfo(token);
  const { t } = useI18n();
  return (
    <Link
      to="/app/status"
      className="block rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg transition hover:shadow-xl"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-brand-200">{t('dash.liveToken')}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-5xl font-extrabold leading-none tracking-tight">#{token.number}</p>
          <p className="mt-1.5 font-mono text-sm font-bold text-brand-100">{token.code}</p>
          <p className="mt-1 truncate text-xs text-brand-200">{token.queueName}</p>
        </div>
        <div className="text-right text-sm font-semibold">
          {token.status === 'waiting' ? (
            <>
              <p className="text-brand-100">{t('status.peopleAhead', { n: info?.ahead ?? '—' })}</p>
              <p className="mt-1 text-2xl font-extrabold">
                {info?.eta ? `~${info.eta.etaMin}` : '—'}
                <span className="text-sm font-semibold text-brand-200">
                  {info?.eta ? ` ±${info.eta.bandMin}` : ''} min
                </span>
              </p>
            </>
          ) : (
            <p className="animate-pulseSoft rounded-xl bg-amber-400/90 px-3 py-2 text-base font-extrabold text-amber-950">
              {t('common.called')}!
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-100">
        {t('status.title')} <ArrowRight size={12} aria-hidden="true" />
      </p>
    </Link>
  );
}

export default function StudentDashboard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const queues = useQueueStore((s) => s.queues);
  const stats = useQueueStore((s) => s.stats);
  const myTokens = useQueueStore((s) => s.myTokens);
  const announcements = useQueueStore((s) => s.announcements);
  const [green, setGreen] = useState(null);

  useEffect(() => {
    let alive = true;
    userStats(user.id)
      .then((s) => alive && setGreen(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.id, myTokens.length]);

  const active = myTokens.filter((tk) => ['waiting', 'called', 'serving'].includes(tk.status));
  const live = active[0];
  const badgeDefs = BADGES.filter((b) => green?.badges?.includes(b.id));
  const activeQueues = queues.filter((q) => q.status === 'active').slice(0, 3);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
        {t('dash.greeting', { name: (user.name || '').split(' ')[0] })}
      </h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          {live ? (
            <MiniLiveToken token={live} />
          ) : (
            <EmptyState
              icon={Ticket}
              title={t('dash.noToken')}
              sub={t('dash.noTokenSub')}
              action={
                <Link
                  to="/app/queues"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
                >
                  {t('dash.browseQueues')} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              }
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-2">
          <StatCard
            icon={Leaf}
            tone="green"
            label={t('dash.greenScore')}
            value={green?.score ?? '—'}
            sub={badgeDefs.length ? `${badgeDefs.length} ${t('green.badges')}` : undefined}
          />
          <StatCard icon={Ticket} tone="teal" label={t('dash.tokensDone')} value={green?.tokens ?? '—'} />
          <StatCard
            icon={Clock}
            tone="violet"
            label={t('dash.timeSaved')}
            value={green ? fmtMinutes(green.minutesSaved) : '—'}
          />
          <StatCard
            icon={Trophy}
            tone="amber"
            label="CO₂ avoided"
            value={green ? `${(green.co2g / 1000).toFixed(2)} kg` : '—'}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionTitle
            title={t('dash.activeQueuesNow')}
            right={
              <Link
                to="/app/queues"
                className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline dark:text-brand-400"
              >
                {t('queues.title')} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeQueues.map((q) => (
              <QueueCard
                key={q.id}
                queue={q}
                stat={stats[q.id]}
                disabledReason={active.some((tk) => tk.queueId === q.id) ? t('errors.ALREADY_IN_QUEUE') : null}
                onJoin={() => navigate('/app/queues')}
              />
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title={t('dash.announcements')} />
          <Card className="max-h-80 space-y-3 overflow-y-auto">
            {announcements.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                <Megaphone size={14} aria-hidden="true" />
                {t('dash.noAnnouncements')}
              </p>
            )}
            {announcements.map((a) => (
              <article
                key={a.id}
                className={`rounded-xl p-3 text-sm ${
                  a.severity === 'critical'
                    ? 'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'
                    : a.severity === 'warning'
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                      : 'bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100'
                }`}
              >
                <p className="font-semibold">{localizedText(a, lang)}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] opacity-70">
                  <CalendarClock size={11} aria-hidden="true" />
                  {fmtDateTime(a.createdAt)}
                </p>
              </article>
            ))}
          </Card>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link
              to="/app/prebook"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3.5 text-sm font-bold text-slate-700 shadow-sm hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <CalendarClock size={16} className="text-brand-600" aria-hidden="true" />
              {t('prebook.title')}
            </Link>
            <Link
              to="/app/status"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3.5 text-sm font-bold text-slate-700 shadow-sm hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Timer size={16} className="text-brand-600" aria-hidden="true" />
              {t('status.leaveNow')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
