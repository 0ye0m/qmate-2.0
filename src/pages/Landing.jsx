import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Leaf, Radar, CalendarCheck, Scale, ArrowRight, TreePine, FileStack, Clock, Recycle, LogIn,
} from 'lucide-react';
import { campusStats } from '../services/green/greenEngine';
import { useCountUp } from '../hooks/useCountUp';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n/I18nProvider';
import { APP } from '../utils/constants';
import { fmtINR } from '../utils/format';

function Metric({ icon: Icon, value, label, suffix = '' }) {
  const v = useCountUp(value);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur ring-1 ring-white/15">
      <span className="rounded-xl bg-white/15 p-2.5" aria-hidden="true">
        <Icon size={22} />
      </span>
      <span>
        <span className="block text-2xl font-extrabold leading-none tracking-tight">
          {Math.round(v).toLocaleString('en-IN')}
          {suffix}
        </span>
        <span className="mt-1 block text-xs font-semibold text-brand-100">{label}</span>
      </span>
    </div>
  );
}

const HIGHLIGHTS = [
  {
    icon: Radar,
    titleKey: 'landing.h1t',
    descKey: 'landing.h1d',
    tone: 'from-brand-500 to-brand-700',
  },
  {
    icon: CalendarCheck,
    titleKey: 'landing.h2t',
    descKey: 'landing.h2d',
    tone: 'from-emerald-500 to-emerald-700',
  },
  {
    icon: Scale,
    titleKey: 'landing.h3t',
    descKey: 'landing.h3d',
    tone: 'from-teal-500 to-teal-700',
  },
];

export default function Landing() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState({ sheets: 0, co2Kg: 0, minutesSaved: 0, treesEquivalent: 0, totalInr: 0 });

  useEffect(() => {
    let alive = true;
    let tries = 0;
    const load = async () => {
      try {
        const s = await campusStats(365);
        if (alive && (s.tokens > 0 || tries >= 4)) setStats(s);
        else if (alive && s.tokens === 0) {
          tries += 1;
          setTimeout(load, 1200);
        }
      } catch {
        /* landing must render regardless */
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg">
            <Leaf size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-lg font-extrabold leading-none text-slate-900 dark:text-white">{APP.name}</span>
            <span className="block text-xs font-semibold text-brand-600 dark:text-brand-400">{APP.tagline}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <Link
              to="/app"
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
            >
              Open app
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[52rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl dark:bg-brand-900/30"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:pt-16">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Recycle size={13} aria-hidden="true" />
              Paperless · Offline-first · Fair
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-5xl">
              {APP.tagline}
              <span className="mt-2 block bg-gradient-to-r from-brand-600 to-emerald-600 bg-clip-text text-2xl font-bold text-transparent dark:from-brand-400 dark:to-emerald-400 sm:text-3xl">
                {APP.name} — sustainable smart-campus queues
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Take a token from your hostel room, watch it move live, walk in exactly when it's your turn.
              Every digital token saves paper, fuel and hours of standing in line.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={user ? '/app' : '/signup'}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700"
              >
                {user ? 'Open Q-Mate' : 'Get started'}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              {!user && (
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-bold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50 dark:bg-slate-800 dark:text-brand-300 dark:ring-slate-600"
                >
                  <LogIn size={17} aria-hidden="true" />
                  Log in
                </Link>
              )}
            </div>
            <ol className="mt-8 grid max-w-md gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              {['landing.step1', 'landing.step2', 'landing.step3'].map((k, i) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-extrabold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    {i + 1}
                  </span>
                  {t(k)}
                </li>
              ))}
            </ol>
          </div>

          {/* Green impact counters */}
          <div className="rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-6 shadow-2xl shadow-brand-900/20 sm:p-8">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-brand-200">
              <TreePine size={16} aria-hidden="true" />
              Green impact so far
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Metric icon={FileStack} value={stats.sheets} label={t('landing.metricSheets')} />
              <Metric icon={Leaf} value={stats.co2Kg} label={t('landing.metricCo2')} suffix="" />
              <Metric
                icon={Clock}
                value={Math.round(stats.minutesSaved / 60)}
                label={t('landing.metricHours')}
              />
              <Metric icon={TreePine} value={Math.round(stats.treesEquivalent * 100) / 100} label={t('landing.metricTrees')} />
            </div>
            {stats.totalInr > 0 && (
              <p className="mt-4 rounded-xl bg-white/10 p-3 text-center text-sm font-bold text-brand-50 ring-1 ring-white/15">
                ≈ {fmtINR(stats.totalInr)} of student + staff time saved this year 🌱
              </p>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-brand-200/80">
              Computed on-device from real completed tokens: 5 g CO₂/sheet avoided, commute + HVAC crowd factors,
              21 kg CO₂ per tree-year.
            </p>
          </div>
        </div>
      </section>

      {/* 3 highlights */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {HIGHLIGHTS.map(({ icon: Icon, titleKey, descKey, tone }) => (
            <div
              key={titleKey}
              className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-slate-700/60 dark:bg-slate-800/70"
            >
              <span className={`mb-4 inline-grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-md`}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{t(titleKey)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200/70 py-6 text-center text-xs text-slate-400 dark:border-slate-700/60 dark:text-slate-500">
        {APP.name} · {APP.tagline}
      </footer>
    </div>
  );
}
