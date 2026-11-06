import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Leaf, FileStack, TreePine, Clock, IndianRupee, Printer, Award, Trophy, Download, Users,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../i18n/I18nProvider';
import { campusStats, costSavings, leaderboard } from '../../services/green/greenEngine';
import { exportGreenCsv } from '../../services/export/exportService';
import { describeError } from '../../utils/errors';
import { useUiStore } from '../../store/uiStore';
import StatCard from '../../components/common/StatCard';
import Card, { SectionTitle } from '../../components/common/Card';
import Button from '../../components/common/Button';
import Toggle from '../../components/common/Toggle';
import { fmtINR, fmtMinutes, todayStr } from '../../utils/format';
import { COST_PERIODS, BADGES, GREEN_FACTORS, APP } from '../../utils/constants';

export default function Sustainability() {
  const { t } = useI18n();
  const me = useAuthStore((s) => s.user);
  const eco = useUiStore((s) => s.eco);
  const setEco = useUiStore((s) => s.setEco);
  const [period, setPeriod] = useState('semester');
  const [stats, setStats] = useState(null);
  const [costs, setCosts] = useState(null);
  const [board, setBoard] = useState([]);

  useEffect(() => {
    campusStats(COST_PERIODS[period].days).then(setStats).catch(() => {});
  }, [period]);

  useEffect(() => {
    costSavings().then(setCosts).catch(() => {});
    leaderboard().then(setBoard).catch(() => {});
  }, []);

  const doExport = async () => {
    try {
      await exportGreenCsv(me, COST_PERIODS[period].days);
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    }
  };

  const periodCost = costs?.[period === 'month' ? 'month' : period === 'semester' ? 'semester' : 'year'];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('green.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl ring-1 ring-slate-200 dark:ring-slate-600" role="radiogroup" aria-label={t('green.period')}>
            {Object.entries(COST_PERIODS).map(([key, p]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={period === key}
                onClick={() => setPeriod(key)}
                className={`px-3.5 py-2 text-xs font-bold transition ${
                  period === key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={doExport}>
            <Download size={15} aria-hidden="true" />
            {t('common.export')}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" />
            {t('green.printReport')}
          </Button>
        </div>
      </div>

      {/* PRINT-AREA — NAAC / green-audit friendly summary */}
      <div className="print-area rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70">
        <header className="mb-5 hidden print:block">
          <h2 className="text-xl font-extrabold">{t('green.reportTitle')}</h2>
          <p className="text-sm text-slate-500">
            {APP.org} · period: {COST_PERIODS[period].label} · generated {todayStr()}
          </p>
        </header>

        <SectionTitle
          title={`🌱 ${t('green.campusImpact')} — ${COST_PERIODS[period].label}`}
          sub={t('green.printHint')}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard icon={FileStack} label={t('green.sheets')} value={stats ? stats.sheets.toLocaleString('en-IN') : '—'} />
          <StatCard icon={Leaf} tone="green" label={t('green.co2')} value={stats ? `${stats.co2Kg} kg` : '—'} />
          <StatCard icon={TreePine} tone="green" label={t('green.trees')} value={stats ? stats.treesEquivalent : '—'} />
          <StatCard
            icon={Clock}
            tone="violet"
            label={t('green.hours')}
            value={stats ? fmtMinutes(stats.minutesSaved) : '—'}
          />
          <StatCard
            icon={IndianRupee}
            tone="amber"
            label={t('green.value')}
            value={stats ? fmtINR(stats.totalInr) : '—'}
          />
        </div>

        {periodCost && (
          <div className="mt-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-brand-700 p-5 text-white">
            <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-100">{t('green.costTitle')}</h3>
            <p className="mt-1 text-xs text-emerald-100/80">{t('green.costSub')}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/20">
                <p className="text-xs font-bold text-emerald-100">{t('green.paperCost')}</p>
                <p className="text-2xl font-extrabold">{fmtINR(periodCost.paperCostSaved)}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/20">
                <p className="text-xs font-bold text-emerald-100">{t('green.staffSavings')}</p>
                <p className="text-2xl font-extrabold">{fmtINR(periodCost.staffSavings)}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/20">
                <p className="text-xs font-bold text-emerald-100">{t('green.value')}</p>
                <p className="text-2xl font-extrabold">{fmtINR(periodCost.totalInr)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Trophy size={15} aria-hidden="true" />
              {t('green.leaderboard')}
            </h3>
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400 dark:bg-slate-900/40">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">{t('green.dept')}</th>
                    <th className="px-3 py-2">{t('green.tokens')}</th>
                    <th className="px-3 py-2">CO₂</th>
                    <th className="px-3 py-2">{t('green.score')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {board.map((row, i) => (
                    <tr key={row.department}>
                      <td className="px-3 py-2 font-bold text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100">{row.department}</td>
                      <td className="px-3 py-2">{row.tokens}</td>
                      <td className="px-3 py-2">{row.co2Kg} kg</td>
                      <td className="px-3 py-2 font-extrabold text-brand-600 dark:text-brand-400">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Award size={15} aria-hidden="true" />
              {t('green.badges')}
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BADGES.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {b.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{b.name}</span>
                    <span className="block text-xs text-slate-400">{b.desc}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 border-t border-slate-200 pt-3 text-[11px] text-slate-400 dark:border-slate-700">
          {t('green.reportFooter')}
        </p>
      </div>

      <Card className="no-print">
        <SectionTitle title={`🌿 ${t('green.ecoTitle')}`} />
        <div className="flex items-center justify-between gap-4">
          <p className="max-w-lg text-sm text-slate-500 dark:text-slate-400">{t('green.ecoDesc')}</p>
          <Toggle checked={eco} onChange={setEco} id="eco-sustain" label={eco ? 'ON' : 'OFF'} />
        </div>
      </Card>
    </div>
  );
}
