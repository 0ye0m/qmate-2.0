import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, TicketCheck, CalendarX2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useQueueStore } from '../../store/queueStore';
import { useI18n } from '../../i18n/I18nProvider';
import { listForQueueDate, cancel as cancelPrebook, convertToToken } from '../../services/queue/prebookService';
import { storage } from '../../services/storage';
import { describeError } from '../../utils/errors';
import { useEventBus } from '../../hooks/useEventBus';
import Card, { SectionTitle } from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { Select } from '../../components/common/Input';
import { todayStr } from '../../utils/format';
import { QUEUE_STATUS } from '../../utils/constants';
import { EVENTS } from '../../services/realtime/EventBus';

/** Admin prebooking desk: verify walk-ins, convert to tokens, cancel. */
export default function PrebookAdmin() {
  const { t } = useI18n();
  const me = useAuthStore((s) => s.user);
  const queues = useQueueStore((s) => s.queues);
  const [date, setDate] = useState(todayStr());
  const [queueId, setQueueId] = useState('');
  const [rows, setRows] = useState([]);
  const [usersById, setUsersById] = useState(new Map());

  useEffect(() => {
    if (!queueId && queues.length) {
      const first = queues.find((q) => q.status === QUEUE_STATUS.ACTIVE) || queues[0];
      setQueueId(first.id);
    }
  }, [queues, queueId]);

  const load = async () => {
    if (!queueId) return;
    try {
      const [pbs, users] = await Promise.all([listForQueueDate(queueId, date), storage.getAll('users')]);
      setRows(pbs);
      setUsersById(new Map(users.map((u) => [u.id, u])));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, date]);

  useEventBus((msg) => {
    if ([EVENTS.PREBOOK_CREATED, EVENTS.PREBOOK_CANCELLED].includes(msg.type)) load();
  });

  const sorted = useMemo(() => rows.sort((a, b) => a.time.localeCompare(b.time)), [rows]);

  const doConvert = async (pb) => {
    try {
      const token = await convertToToken(me, pb.id);
      toast.success(t('prebook.converted', { n: token.number }));
      load();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    }
  };

  const doCancel = async (pb) => {
    try {
      await cancelPrebook(pb.id, pb.userId);
      toast.success(t('prebook.cancelledToast'));
      load();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('nav.prebooking')}</h1>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('prebook.pickQueue')}
            name="pbAdminQueue"
            value={queueId}
            onChange={(e) => setQueueId(e.target.value)}
            options={queues.map((q) => ({ value: q.id, label: q.name }))}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">{t('prebook.pickDate')}</span>
            <input
              type="date"
              name="pbAdminDate"
              value={date}
              onChange={(e) => setDate(e.target.value || todayStr())}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-white"
            />
          </label>
        </div>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('prebook.myBookings')} sub={t('prebook.none')} />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {sorted.map((pb) => {
              const u = usersById.get(pb.userId);
              return (
                <li key={pb.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="rounded-xl bg-brand-100 p-2 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    <TicketCheck size={17} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">
                      {pb.time} · {u?.name || '—'} <span className="font-normal text-slate-400">({u?.department || '—'})</span>
                    </span>
                    <span className="text-xs text-slate-400">{u?.email}</span>
                  </span>
                  {pb.offpeak && (
                    <Badge tone="green">🌱 {t('prebook.lowCrowd')}</Badge>
                  )}
                  <Badge tone={pb.status === 'booked' ? 'teal' : pb.status === 'converted' ? 'green' : 'slate'}>
                    {pb.status}
                  </Badge>
                  {pb.status === 'booked' && (
                    <>
                      <Button size="sm" onClick={() => doConvert(pb)}>
                        {t('prebook.checkin')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => doCancel(pb)} aria-label={t('prebook.cancelBooking')}>
                        <CalendarX2 size={14} className="text-rose-500" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
