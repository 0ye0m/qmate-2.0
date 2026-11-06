import { useEffect, useMemo, useState } from 'react';
import { ScrollText, Download } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../i18n/I18nProvider';
import { list, actions } from '../../services/queue/auditService';
import { downloadCsv } from '../../utils/csv';
import { fmtDateTime } from '../../utils/format';
import Card, { SectionTitle } from '../../components/common/Card';
import { Select } from '../../components/common/Input';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import Badge from '../../components/common/Badge';

const ACTION_TONE = {
  'queue.create': 'green',
  'queue.update': 'teal',
  'queue.active': 'green',
  'queue.paused': 'amber',
  'queue.completed': 'slate',
  'token.call': 'violet',
  'token.complete': 'green',
  'token.skip': 'amber',
  'token.no-show': 'rose',
  'token.recall': 'teal',
  'token.verifyPriority': 'violet',
  'counter.open': 'green',
  'counter.close': 'amber',
  'announcement.publish': 'teal',
  'prebook.convert': 'teal',
  'user.update': 'teal',
  'report.exportTokens': 'slate',
  'report.exportUsers': 'slate',
  'report.exportGreen': 'slate',
};

export default function AuditLog() {
  const { t } = useI18n();
  const me = useAuthStore((s) => s.user);
  const [rows, setRows] = useState([]);
  const [allActions, setAllActions] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [r, a] = await Promise.all([list({ limit: 300 }), actions()]);
        setRows(r);
        setAllActions(a);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const filtered = useMemo(() => (filter ? rows.filter((r) => r.action === filter) : rows), [rows, filter]);

  const exportCsv = () => {
    downloadCsv(
      'qmate-audit-log.csv',
      filtered.map((r) => ({
        when: fmtDateTime(r.ts),
        actor: r.actorEmail,
        action: r.action,
        target: `${r.targetType}:${String(r.targetId).slice(0, 12)}`,
        details: JSON.stringify(r.details || {}),
      }))
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          <ScrollText size={22} className="text-brand-600" aria-hidden="true" />
          {t('audit.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            name="auditFilter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            options={[{ value: '', label: t('audit.filterAll') }, ...allActions.map((a) => ({ value: a, label: a }))]}
            className="w-48"
            aria-label={t('audit.filterAll')}
          />
          <Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}>
            <Download size={15} aria-hidden="true" />
            {t('common.export')}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ScrollText} title={t('audit.title')} sub={t('audit.empty')} />
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="px-4 py-3">{t('audit.when')}</th>
                  <th className="px-4 py-3">{t('audit.actor')}</th>
                  <th className="px-4 py-3">{t('audit.action')}</th>
                  <th className="px-4 py-3">{t('audit.target')}</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {fmtDateTime(r.ts)}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{r.actorEmail}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={ACTION_TONE[r.action] || 'slate'}>{r.action}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {r.targetType}:{String(r.targetId).slice(0, 10)}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-2.5 font-mono text-[11px] text-slate-400">
                      {JSON.stringify(r.details || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
