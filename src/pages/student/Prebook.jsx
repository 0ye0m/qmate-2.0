import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, CalendarX2, RefreshCcw, TicketCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useQueueStore } from '../../store/queueStore';
import { useI18n } from '../../i18n/I18nProvider';
import { slotsFor, book, cancel, reschedule, listForUser, convertToToken } from '../../services/queue/prebookService';
import { describeError } from '../../utils/errors';
import { Card, SectionTitle } from '../../components/common/Card';
import { Select } from '../../components/common/Input';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import EmptyState from '../../components/common/EmptyState';
import { todayStr, dateStrOf } from '../../utils/format';
import { GREEN_POINTS } from '../../utils/constants';

const LEVEL_TONE = { low: 'green', medium: 'amber', high: 'rose' };

function SlotButton({ slot, onPick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-label={`${slot.time} — ${label}`}
      className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-bold transition ${
        slot.level === 'low'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300'
          : slot.level === 'medium'
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/25 dark:text-amber-300'
            : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/25 dark:text-rose-300'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className="text-base">{slot.time}</span>
      <span className="text-[11px] font-semibold opacity-80">
        {slot.load}/{slot.capacity} · {label}
      </span>
    </button>
  );
}

export default function Prebook() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const queues = useQueueStore((s) => s.queues);
  const [queueId, setQueueId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [busy, setBusy] = useState(false);

  const bookableQueues = useMemo(() => queues.filter((q) => ['active', 'scheduled'].includes(q.status)), [queues]);

  const refreshBookings = async () => {
    try {
      setBookings(await listForUser(user.id));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    refreshBookings();
    if (!queueId && bookableQueues.length) setQueueId(bookableQueues[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, queues.length]);

  useEffect(() => {
    let alive = true;
    const q = bookableQueues.find((x) => x.id === queueId);
    if (!q) {
      setSlots([]);
      return undefined;
    }
    slotsFor(q, date)
      .then((s) => alive && setSlots(s))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [queueId, date, bookableQueues, bookings.length]);

  const doBook = async (slot) => {
    setBusy(true);
    try {
      const created = await book({ userId: user.id, queueId, date, time: slot.time });
      toast.success(t('prebook.bookedToast', { time: created.time, date: created.date }));
      if (created.offpeak) toast.success(t('prebook.bonusToast', { n: GREEN_POINTS.offpeakJoinBonus }), { icon: '🌱' });
      refreshBookings();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async (pb) => {
    try {
      await cancel(pb.id, user.id);
      toast.success(t('prebook.cancelledToast'));
      refreshBookings();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    }
  };

  const doReschedule = async (pb) => {
    // simple +7 days / same time move (slot grid above handles fine-tuning)
    // parse the date string as LOCAL midnight — never as UTC — then add 7 days
    const d = new Date(`${pb.date}T00:00:00`);
    d.setDate(d.getDate() + 7);
    const nextDate = dateStrOf(d.getTime());
    try {
      await reschedule(pb.id, user.id, nextDate, pb.time);
      toast.success(t('prebook.bookedToast', { time: pb.time, date: nextDate }));
      refreshBookings();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    }
  };

  const doConvert = async (pb) => {
    try {
      const token = await convertToToken(user, pb.id);
      toast.success(t('prebook.converted', { n: token.number }));
      refreshBookings();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    }
  };

  const active = bookings.filter((b) => b.status === 'booked');
  const past = bookings.filter((b) => b.status !== 'booked');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('prebook.title')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('prebook.sub')}</p>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('prebook.pickQueue')}
            name="pbQueue"
            value={queueId}
            onChange={(e) => setQueueId(e.target.value)}
            options={bookableQueues.map((q) => ({ value: q.id, label: `${q.name} (${q.department})` }))}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t('prebook.pickDate')}
            </span>
            <input
              type="date"
              name="pbDate"
              value={date}
              min={todayStr()}
              max={(() => {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                return dateStrOf(d.getTime());
              })()}
              onChange={(e) => setDate(e.target.value || todayStr())}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900/60 dark:text-white"
            />
          </label>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t('prebook.pickSlot')} — <Badge tone="green">{t('prebook.lowCrowd')}</Badge>{' '}
            <span className="text-xs font-normal text-slate-400">+{GREEN_POINTS.offpeakJoinBonus} 🌱</span>
          </p>
          {slots.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t('common.loading')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {slots.map((slot) => (
                <SlotButton
                  key={slot.time}
                  slot={slot}
                  disabled={busy || slot.past || slot.load >= slot.capacity}
                  label={slot.past ? t('prebook.pastSlot') : slot.level === 'low' ? t('prebook.lowCrowd') : slot.level === 'medium' ? t('prebook.mediumCrowd') : t('prebook.highCrowd')}
                  onPick={() => doBook(slot)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <section>
        <SectionTitle title={t('prebook.myBookings')} />
        {active.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t('prebook.myBookings')} sub={t('prebook.none')} />
        ) : (
          <ul className="space-y-2.5">
            {active.map((pb) => (
              <li
                key={pb.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-800/70"
              >
                <span className="rounded-xl bg-brand-100 p-2 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                  <TicketCheck size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{pb.queueName}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {pb.date} · {pb.time}
                    {pb.offpeak && (
                      <Badge tone="green" className="ml-2">
                        🌱 {t('prebook.lowCrowd')}
                      </Badge>
                    )}
                  </span>
                </span>
                {pb.date === todayStr() && (
                  <Button size="sm" onClick={() => doConvert(pb)}>
                    {t('prebook.checkin')}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => doReschedule(pb)} aria-label={t('prebook.reschedule')}>
                  <RefreshCcw size={13} aria-hidden="true" />
                  {t('prebook.reschedule')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => doCancel(pb)} aria-label={t('prebook.cancelBooking')}>
                  <CalendarX2 size={14} aria-hidden="true" />
                  {t('common.cancel')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            {past.length} past bookings · {past.filter((p) => p.status === 'converted').length} converted to tokens
          </p>
        )}
      </section>
    </div>
  );
}
