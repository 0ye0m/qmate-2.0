import { useMemo, useState } from 'react';
import { ListChecks, Search } from 'lucide-react';
import { useQueueStore } from '../../store/queueStore';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../i18n/I18nProvider';
import QueueCard from '../../components/queue/QueueCard';
import JoinFlowModal from '../../components/queue/JoinFlowModal';
import EmptyState from '../../components/common/EmptyState';
import { Select, Input } from '../../components/common/Input';
import { DEPARTMENTS } from '../../utils/constants';

/** Browse + join live queues. Filters, live ETA cards, checklist join flow. */
export default function ActiveQueues() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const queues = useQueueStore((s) => s.queues);
  const stats = useQueueStore((s) => s.stats);
  const myTokens = useQueueStore((s) => s.myTokens);
  const [dept, setDept] = useState('all');
  const [query, setQuery] = useState('');
  const [joinQueue, setJoinQueue] = useState(null);

  const filtered = useMemo(() => {
    return queues
      .filter((q) => (dept === 'all' ? true : q.department === dept))
      .filter((q) => {
        if (!query.trim()) return true;
        const hay = `${q.name} ${q.department} ${q.description}`.toLowerCase();
        return hay.includes(query.trim().toLowerCase());
      })
      .sort((a, b) => {
        const rank = { active: 0, scheduled: 1, paused: 2, inactive: 3, completed: 4 };
        return (rank[a.status] ?? 5) - (rank[b.status] ?? 5);
      });
  }, [queues, dept, query]);

  const reasonFor = (q) => {
    if (q.status !== 'active') return t(`common.${q.status}`);
    if (myTokens.some((tk) => tk.queueId === q.id && ['waiting', 'called', 'serving'].includes(tk.status))) {
      return t('errors.ALREADY_IN_QUEUE');
    }
    if ((stats[q.id]?.slotsUsed ?? 0) >= q.maxSlots) return t('queues.full');
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('queues.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              name="queueSearch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('queues.searchPh')}
              aria-label={t('common.search')}
              className="w-48 sm:w-60"
            />
          </div>
          <Select
            name="deptFilter"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            aria-label={t('queues.deptFilter')}
            options={[{ value: 'all', label: t('common.all') }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]}
            className="w-32"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ListChecks} title={t('queues.title')} sub={t('queues.emptySub')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((q) => (
            <QueueCard
              key={q.id}
              queue={q}
              stat={stats[q.id]}
              disabledReason={reasonFor(q)}
              onJoin={(queue) => setJoinQueue(queue)}
            />
          ))}
        </div>
      )}

      <JoinFlowModal
        open={!!joinQueue}
        queue={joinQueue}
        user={user}
        onClose={() => setJoinQueue(null)}
      />
    </div>
  );
}
