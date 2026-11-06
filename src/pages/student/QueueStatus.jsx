import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Ticket, Radar, Users, Clock3, DoorOpen, BellRing, QrCode, Timer, Coffee, LogOut, Footprints,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useQueueStore } from '../../store/queueStore';
import { useUiStore } from '../../store/uiStore';
import { useI18n } from '../../i18n/I18nProvider';
import { useNow, useOnline } from '../../hooks/useEventBus';
import { useLiveTokenInfo } from '../../hooks/useLiveTokenInfo';
import { leaveQueue, stepAway, markArrived } from '../../services/queue/queueService';
import { describeError } from '../../utils/errors';
import { alertAll, notificationPermission, requestNotificationPermission } from '../../services/notifications/notificationService';
import TokenCard from '../../components/queue/TokenCard';
import NowServingBanner from '../../components/queue/NowServingBanner';
import Button from '../../components/common/Button';
import Card, { SectionTitle } from '../../components/common/Card';
import Toggle from '../../components/common/Toggle';
import EmptyState from '../../components/common/EmptyState';
import StatusPill from '../../components/common/StatusPill';
import { countdown, fmtClock } from '../../utils/format';
import { LIVE_TOKEN_STATUSES, STEP_AWAY_MS } from '../../utils/constants';

/** The student's live remote-control screen for their active token. */
export default function QueueStatus() {
  const { t } = useI18n();
  const online = useOnline();
  const now = useNow(1000);
  const user = useAuthStore((s) => s.user);
  const myTokens = useQueueStore((s) => s.myTokens);
  const travelMinutes = useUiStore((s) => s.travelMinutes);
  const setTravelMinutes = useUiStore((s) => s.setTravelMinutes);
  const sound = useUiStore((s) => s.sound);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  const live = myTokens.filter((tk) => LIVE_TOKEN_STATUSES.includes(tk.status));
  const token = live.find((tk) => tk.id === selectedId) || live[0];
  const info = useLiveTokenInfo(token);
  const isAway = token?.stepAwayUntil && token.stepAwayUntil > now;

  if (!token) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('status.title')}</h1>
        <EmptyState icon={Radar} title={t('status.noActive')} sub={t('status.noActiveSub')} />
      </div>
    );
  }

  const called = token.status === 'called';
  const serving = token.status === 'serving';

  const doLeave = async () => {
    setBusy(true);
    try {
      await leaveQueue(token.id, user.id);
      toast.success(t('queues.leftQueue'));
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setBusy(false);
    }
  };

  const doAway = async (away) => {
    try {
      await stepAway(token.id, user.id, away);
      toast.success(away ? t('queues.stepAway') : t('queues.imBack'));
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    }
  };

  const doCheckin = async () => {
    setBusy(true);
    try {
      await markArrived(token.id);
      toast.success(t('status.checkin'));
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setBusy(false);
    }
  };

  const testAlert = () => {
    alertAll({ title: t('status.title'), body: t('status.notifSent'), tag: 'test', sound });
    if (notificationPermission() !== 'granted') requestNotificationPermission();
    toast.success(t('status.notifSent'));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('status.title')}</h1>
        {!online && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {t('common.offline')}
          </span>
        )}
      </div>

      {live.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {live.map((tk) => (
            <button
              key={tk.id}
              type="button"
              onClick={() => setSelectedId(tk.id)}
              className={`rounded-xl px-3.5 py-2 text-sm font-bold ring-1 transition ${
                tk.id === token.id
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'
              }`}
            >
              {tk.code}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* main live panel */}
        <div className="space-y-4 lg:col-span-3">
          <NowServingBanner queueId={token.queueId} title={`${t('status.nowServing')} — ${token.queueName}`} />

          <Card className="text-center">
            <div className="flex items-center justify-between">
              <StatusPill status={token.status} />
              {isAway ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  <Coffee size={12} aria-hidden="true" />
                  {t('status.awayBadge')} · {countdown(token.stepAwayUntil - now)}
                </span>
              ) : null}
            </div>

            <p className="mt-4 text-7xl font-extrabold tracking-tight text-brand-700 dark:text-brand-300 sm:text-8xl" aria-live="polite">
              #{token.number}
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-500 dark:text-slate-400">{token.code}</p>

            {called && (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:ring-amber-800">
                <p className="text-sm font-extrabold text-amber-800 dark:text-amber-200">
                  🎉 {t('status.counterLabel')}: {info?.counter?.label || '—'} · {t('status.graceLeft', { t: countdown((token.graceUntil || 0) - now) })}
                </p>
                {!serving && (
                  <Button className="mt-3" onClick={doCheckin} loading={busy}>
                    <QrCode size={16} aria-hidden="true" />
                    {t('status.checkin')}
                  </Button>
                )}
              </div>
            )}

            {token.status === 'waiting' && (
              <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-xl bg-slate-50 p-2 sm:p-3 dark:bg-slate-900/40">
                  <p className="text-[10px] font-bold uppercase text-slate-400 sm:text-xs">{t('status.yourPosition')}</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">{info?.position ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2 sm:p-3 dark:bg-slate-900/40">
                  <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400 sm:text-xs">
                    <Users size={11} aria-hidden="true" />
                    {t('status.peopleAhead', { n: '' })}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">{info?.ahead ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-brand-50 p-2 sm:p-3 dark:bg-brand-900/30">
                  <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-brand-500 sm:text-xs">
                    <Clock3 size={11} aria-hidden="true" />
                    {t('status.estWait')}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-brand-700 dark:text-brand-300 sm:text-3xl" aria-live="polite">
                    {info?.eta ? `~${info.eta.etaMin}` : '—'}
                    {info?.eta ? <span className="text-xs font-bold sm:text-sm"> ±{info.eta.bandMin}</span> : null}
                  </p>
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
              {t('status.qrHint')} · joined {fmtClock(token.issuedAt)}
            </p>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <SectionTitle title={t('queues.stepAway')} />
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('status.stepAwayDesc')}</p>
              <div className="flex items-center justify-between">
                {isAway ? (
                  <Button variant="secondary" onClick={() => doAway(false)}>
                    <Footprints size={15} aria-hidden="true" />
                    {t('queues.imBack')}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => doAway(true)} disabled={token.status !== 'waiting'}>
                    <Coffee size={15} aria-hidden="true" />
                    {t('queues.stepAway')}
                  </Button>
                )}
                <span className="text-xs text-slate-400">{Math.round(STEP_AWAY_MS / 60000)} min</span>
              </div>
            </Card>

            <Card>
              <SectionTitle title={t('status.leaveNow')} />
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                {t('status.leaveNowDesc', { min: travelMinutes })}
              </p>
              <div className="flex items-center gap-2">
                <Timer size={16} className="text-brand-600" aria-hidden="true" />
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={travelMinutes}
                  onChange={(e) => setTravelMinutes(e.target.value)}
                  aria-label={t('status.travelTime')}
                  className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-white"
                />
                <span className="text-sm text-slate-500">{t('status.travelTime')}</span>
              </div>
            </Card>
          </div>
        </div>

        {/* side: QR card + actions */}
        <div className="space-y-4 lg:col-span-2">
          <TokenCard token={token} queue={{ name: token.queueName }} />

          <Card className="space-y-3">
            <Toggle checked={sound} onChange={(v) => useUiStore.getState().setSound(v)} label={t('settings.sound')} id="sound-toggle" />
            <Button variant="secondary" size="sm" className="w-full" onClick={testAlert}>
              <BellRing size={14} aria-hidden="true" />
              {t('status.notifTest')}
            </Button>
            {token.status === 'waiting' && (
              <Button variant="danger" size="sm" className="w-full" onClick={doLeave} loading={busy}>
                <DoorOpen size={14} aria-hidden="true" />
                {t('status.leave')}
              </Button>
            )}
            {token.status !== 'waiting' && (
              <Button variant="danger" size="sm" className="w-full" onClick={doLeave} disabled>
                <LogOut size={14} aria-hidden="true" />
                {t('common.called')} — {t('status.checkinHint')}
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
