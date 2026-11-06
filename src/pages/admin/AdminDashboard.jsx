import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ListChecks, Users2, CheckCheck, Clock3, UserX, Leaf, Megaphone, Sparkles, Play, Square, Send, Wand2, Gauge,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useQueueStore } from '../../store/queueStore';
import { useUiStore } from '../../store/uiStore';
import { useI18n } from '../../i18n/I18nProvider';
import { storage } from '../../services/storage';
import { campusStats } from '../../services/green/greenEngine';
import { adminInsights } from '../../services/ai/aiFeatures';
import { publish, localizedText } from '../../services/queue/announcementService';
import { describeError } from '../../utils/errors';
import { avgWaitMin, noShowRate, peakHours } from '../../utils/analytics';
import StatCard from '../../components/common/StatCard';
import Card, { SectionTitle } from '../../components/common/Card';
import Toggle from '../../components/common/Toggle';
import Button from '../../components/common/Button';
import { Select, Textarea } from '../../components/common/Input';
import Badge from '../../components/common/Badge';
import { TOKEN_STATUS } from '../../utils/constants';
import { fmtDateTime, fmtMinutes } from '../../utils/format';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function AdminDashboard() {
  const { t, lang } = useI18n();
  const user = useAuthStore((s) => s.user);
  const queues = useQueueStore((s) => s.queues);
  const stats = useQueueStore((s) => s.stats);
  const simulator = useUiStore((s) => s.simulator);
  const setSimulator = useUiStore((s) => s.setSimulator);
  const eco = useUiStore((s) => s.eco);

  const [todayTokens, setTodayTokens] = useState([]);
  const [insight, setInsight] = useState(null);
  const [insightBusy, setInsightBusy] = useState(false);
  const [ann, setAnn] = useState({ queueId: '', severity: 'info', en: '', hi: '', mr: '' });
  const [annBusy, setAnnBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    storage
      .getAll('tokens')
      .then((all) => alive && setTodayTokens(all.filter((tk) => (tk.issuedAt || 0) >= startOfToday())))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [queues.length, todayTokens.length]);

  const kpi = useMemo(() => {
    const waitingNow = Object.values(stats).reduce((a, s) => a + (s.waiting || 0), 0);
    const active = queues.filter((q) => q.status === 'active').length;
    const served = todayTokens.filter((tk) => tk.status === TOKEN_STATUS.COMPLETED).length;
    return {
      active,
      waitingNow,
      served,
      avgWait: avgWaitMin(todayTokens.filter((tk) => tk.completedAt)),
      noShow: noShowRate(todayTokens),
    };
  }, [queues, stats, todayTokens]);

  const [greenToday, setGreenToday] = useState(null);
  useEffect(() => {
    campusStats(1).then(setGreenToday).catch(() => {});
  }, [kpi.served]);

  const nowServing = useMemo(
    () => todayTokens.filter((tk) => [TOKEN_STATUS.CALLED, TOKEN_STATUS.SERVING].includes(tk.status)).slice(0, 8),
    [todayTokens]
  );

  const generateInsights = async () => {
    setInsightBusy(true);
    try {
      const peak = peakHours(todayTokens, 1)[0];
      const busiest = Object.entries(stats).sort((a, b) => (b[1].waiting || 0) - (a[1].waiting || 0))[0];
      const busiestQueue = busiest ? queues.find((q) => q.id === busiest[0]) : null;
      const acc = null; // accuracy surfaces on the Analytics page; keep aggregates light
      const agg = {
        tokens: kpi.served,
        queueCount: queues.length,
        avgWaitMin: kpi.avgWait,
        noShowRate: kpi.noShow,
        peakHour: peak?.hour ?? null,
        busiestQueue: busiestQueue ? { name: busiestQueue.name, waiting: busiest[1].waiting } : null,
        predictionAccuracy: acc,
      };
      const res = await adminInsights(agg, lang);
      setInsight(res);
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setInsightBusy(false);
    }
  };

  const polishAnnouncement = async () => {
    if (!ann.en.trim()) return;
    setAnnBusy(true);
    try {
      const { writeAnnouncement } = await import('../../services/ai/aiFeatures');
      const res = await writeAnnouncement(ann.en, lang);
      setAnn((a) => ({ ...a, en: res.en, hi: res.hi, mr: res.mr }));
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setAnnBusy(false);
    }
  };

  const doPublish = async () => {
    if (!ann.queueId || !ann.en.trim()) return;
    setAnnBusy(true);
    try {
      await publish(user, { queueId: ann.queueId, severity: ann.severity, messageEn: ann.en, messageHi: ann.hi, messageMr: ann.mr });
      toast.success(t('admin.dash.annPublished'), { icon: '📢' });
      setAnn({ queueId: '', severity: 'info', en: '', hi: '', mr: '' });
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setAnnBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('admin.dash.title')}</h1>
        <Card className="!p-3">
          <Toggle
            checked={simulator}
            onChange={(v) => setSimulator(v)}
            disabled={eco}
            id="sim-toggle"
            label={
              <span className="inline-flex items-center gap-1.5">
                {simulator ? <Square size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                {t('admin.dash.simulator')}
              </span>
            }
          />
          <p className="mt-1 max-w-xs text-[11px] text-slate-400 dark:text-slate-500">{t('admin.dash.simulatorHint')}</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard icon={ListChecks} label={t('admin.dash.kpiActive')} value={kpi.active} />
        <StatCard icon={Users2} tone="violet" label={t('admin.dash.kpiWaiting')} value={kpi.waitingNow} />
        <StatCard icon={CheckCheck} tone="green" label={t('admin.dash.kpiServed')} value={kpi.served} />
        <StatCard icon={Clock3} tone="amber" label={t('admin.dash.kpiAvgWait')} value={fmtMinutes(kpi.avgWait)} />
        <StatCard icon={UserX} tone="rose" label={t('admin.dash.kpiNoShow')} value={`${kpi.noShow}%`} />
        <StatCard
          icon={Leaf}
          tone="green"
          label={t('admin.dash.kpiGreen')}
          value={greenToday ? `${greenToday.co2Kg} kg` : '—'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionTitle title={t('admin.dash.board')} />
          <Card>
            {nowServing.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">{t('admin.dash.noServing')}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {nowServing.map((tk) => {
                  const q = queues.find((x) => x.id === tk.queueId);
                  return (
                    <li
                      key={tk.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3.5 py-2.5 dark:bg-brand-900/30"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-brand-900 dark:text-brand-100">
                          {q?.code || '—'}-{tk.number}
                        </span>
                        <span className="block truncate text-xs text-brand-700/70 dark:text-brand-300/70">{q?.name}</span>
                      </span>
                      <Badge tone={tk.status === 'called' ? 'amber' : 'violet'}>
                        {tk.counterLabel || (tk.status === 'called' ? t('common.called') : t('common.serving'))}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="mt-6">
            <SectionTitle title={t('admin.dash.insightTitle')} />
            <Card>
              {insight ? (
                <div className="space-y-3">
                  <Badge tone={insight.mode === 'online' ? 'green' : 'amber'}>
                    <Sparkles size={11} aria-hidden="true" />
                    {insight.mode === 'online' ? t('ai.modeOnline') : t('ai.modeFallback')}
                  </Badge>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{insight.summary}</p>
                  <ul className="space-y-2">
                    {insight.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-extrabold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                          {i + 1}
                        </span>
                        {r}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-400">{fmtDateTime(Date.now())}</p>
                </div>
              ) : (
                <Button onClick={generateInsights} loading={insightBusy}>
                  <Sparkles size={15} aria-hidden="true" />
                  {insightBusy ? t('admin.dash.insightLoading') : t('admin.dash.insightBtn')}
                </Button>
              )}
            </Card>
          </div>
        </section>

        <section>
          <SectionTitle title={t('admin.dash.annTitle')} />
          <Card className="space-y-3">
            <Select
              label={t('admin.dash.annQueue')}
              name="annQueue"
              value={ann.queueId}
              onChange={(e) => setAnn((a) => ({ ...a, queueId: e.target.value }))}
              options={[{ value: '', label: '—' }, ...queues.map((q) => ({ value: q.id, label: q.name }))]}
            />
            <Select
              label={t('common.status')}
              name="annSeverity"
              value={ann.severity}
              onChange={(e) => setAnn((a) => ({ ...a, severity: e.target.value }))}
              options={[
                { value: 'info', label: 'ℹ️ Info' },
                { value: 'warning', label: '⚠️ Warning' },
                { value: 'critical', label: '🚨 Critical' },
              ]}
            />
            <Textarea
              label="English"
              name="annEn"
              rows={2}
              placeholder={t('admin.dash.annPh')}
              value={ann.en}
              onChange={(e) => setAnn((a) => ({ ...a, en: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Textarea
                label="हिन्दी"
                name="annHi"
                rows={2}
                value={ann.hi}
                onChange={(e) => setAnn((a) => ({ ...a, hi: e.target.value }))}
              />
              <Textarea
                label="मराठी"
                name="annMr"
                rows={2}
                value={ann.mr}
                onChange={(e) => setAnn((a) => ({ ...a, mr: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={polishAnnouncement} loading={annBusy} disabled={!ann.en.trim()}>
                <Wand2 size={14} aria-hidden="true" />
                {t('admin.dash.annPolish')}
              </Button>
              <Button size="sm" onClick={doPublish} loading={annBusy} disabled={!ann.queueId || !ann.en.trim()}>
                <Send size={14} aria-hidden="true" />
                {t('admin.dash.annPublish')}
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <Megaphone size={12} aria-hidden="true" />
              {t('ai.privacyNote')}
            </p>
          </Card>

          <Card className="mt-4">
            <SectionTitle title={t('admin.dash.accuracy')} />
            <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Gauge size={16} className="text-brand-600" aria-hidden="true" />
              {t('analytics.title')} → {t('analytics.accuracy')}
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
