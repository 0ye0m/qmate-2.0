import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BarChart as RechartsBar, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { BarChart3, Download } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../i18n/I18nProvider';
import { storage } from '../../services/storage';
import { exportTokensCsv } from '../../services/export/exportService';
import { hourlyLoad, noShowRate, waitBuckets, peakHours, lastDays, avgWaitMin } from '../../utils/analytics';
import { accuracyForQueue } from '../../services/prediction/predictionService';
import { describeError } from '../../utils/errors';
import StatCard from '../../components/common/StatCard';
import Card, { SectionTitle } from '../../components/common/Card';
import Button from '../../components/common/Button';
import { fmtMinutes } from '../../utils/format';
import { TOKEN_STATUS } from '../../utils/constants';

const PIE_COLORS = ['#14b8a6', '#f59e0b', '#f43f5e', '#8b5cf6', '#10b981'];

export default function Analytics() {
  const { t } = useI18n();
  const me = useAuthStore((s) => s.user);
  const [days, setDays] = useState(1);
  const [tokens, setTokens] = useState([]);
  const [queues, setQueues] = useState([]);
  const [accuracy, setAccuracy] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [all, qs] = await Promise.all([storage.getAll('tokens'), storage.getAll('queues')]);
        setTokens(all);
        setQueues(qs);
        if (qs[0]) setAccuracy(await accuracyForQueue(qs[0].id));
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const scoped = useMemo(() => lastDays(tokens, 'issuedAt', days), [tokens, days]);
  const completed = useMemo(() => scoped.filter((tk) => tk.status === TOKEN_STATUS.COMPLETED), [scoped]);

  const charts = useMemo(() => {
    const load = hourlyLoad(scoped).map((b) => ({ hour: `${b.hour}:00`, tokens: b.count }));
    const dist = waitBuckets(scoped);
    return { load, dist };
  }, [scoped]);

  // per-counter aggregation across all queues
  const counterRows = useMemo(() => {
    const byCounter = new Map();
    for (const tk of completed) {
      if (!tk.counterId) continue;
      if (!byCounter.has(tk.counterId)) byCounter.set(tk.counterId, []);
      byCounter.get(tk.counterId).push((tk.serviceSeconds || 0) / 60);
    }
    return [...byCounter.entries()].map(([cid, arr]) => ({
      counter: `CPT ${cid.slice(-4)}`,
      avgMin: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10,
    }));
  }, [completed]);

  const peaks = peakHours(scoped, 2);
  const noShow = noShowRate(scoped);
  const pie = [
    { name: 'completed', value: completed.length },
    { name: 'no-show', value: scoped.filter((tk) => tk.status === TOKEN_STATUS.NO_SHOW).length },
    { name: 'skipped', value: scoped.filter((tk) => tk.status === TOKEN_STATUS.SKIPPED).length },
  ].filter((p) => p.value > 0);

  const tooltipStyle = {
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    fontSize: 12,
    fontWeight: 600,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('analytics.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl ring-1 ring-slate-200 dark:ring-slate-600" role="radiogroup" aria-label={t('analytics.title')}>
            {[
              [1, t('common.today')],
              [7, '7d'],
              [30, '30d'],
            ].map(([d, label]) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={days === d}
                onClick={() => setDays(d)}
                className={`px-3.5 py-2 text-xs font-bold transition ${
                  days === d ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() => exportTokensCsv(me, days).catch((e) => toast.error(t(`errors.${describeError(e)}`)))}
          >
            {t('analytics.export')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={BarChart3} label={t('analytics.tokensToday')} value={scoped.length} />
        <StatCard icon={BarChart3} tone="violet" label={t('analytics.avgWait')} value={fmtMinutes(avgWaitMin(completed))} />
        <StatCard icon={BarChart3} tone="amber" label={t('analytics.noShow')} value={`${noShow}%`} />
        <StatCard icon={BarChart3} tone="green" label={t('analytics.accuracy')} value={accuracy != null ? `${accuracy}%` : '—'} />
        <StatCard
          icon={BarChart3}
          tone="rose"
          label={t('analytics.peakHours')}
          value={peaks.length ? peaks.map((p) => `${p.hour}:00`).join(' · ') : '—'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle title={t('analytics.hourlyLoad')} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBar data={charts.load} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="tokens" fill="#14b8a6" radius={[6, 6, 0, 0]} />
              </RechartsBar>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle title={t('analytics.waitDist')} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBar data={charts.dist} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#0d9488" radius={[6, 6, 0, 0]} />
              </RechartsBar>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle title={t('analytics.servicePerCounter')} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBar data={counterRows} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="counter" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="avgMin" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </RechartsBar>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle title={t('analytics.noShow')} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {pie.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t('analytics.counterUtil')}: {queues.length} queues · per-counter utilization visible in each Counter Console.
      </p>
    </div>
  );
}
