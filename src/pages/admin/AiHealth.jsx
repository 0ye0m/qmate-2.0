import { useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, KeyRound, Activity, Trash2, Send, ShieldCheck, Timer, AlertTriangle } from 'lucide-react';
import { useAiStore } from '../../store/aiStore';
import { useI18n } from '../../i18n/I18nProvider';
import { healthSnapshot, clearAiCache, generate } from '../../services/ai/geminiClient';
import Card, { SectionTitle } from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import AiStatusBadge from '../../components/common/AiStatusBadge';
import { GEMINI } from '../../utils/constants';

export default function AiHealth() {
  const { t } = useI18n();
  const snapshot = useAiStore((s) => s.snapshot);
  const mode = useAiStore((s) => s.mode);
  const reset = useAiStore((s) => s.reset);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const health = healthSnapshot();

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await generate({
        prompt: 'Reply with exactly this JSON and nothing else: {"ok":true}',
        system: 'You are a connectivity probe. Output JSON only.',
        json: true,
        temperature: 0,
      });
      setTestResult({ ok: true, ms: res.latencyMs ?? 0, cached: res.cached });
    } catch (err) {
      setTestResult({ ok: false, error: String(err?.message || err) });
    } finally {
      setTesting(false);
    }
  };

  const clearCache = () => {
    clearAiCache();
    reset();
    toast.success(t('ai.cacheCleared'));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          <Sparkles size={22} className="text-brand-600" aria-hidden="true" />
          {t('ai.health.title')}
        </h1>
        <AiStatusBadge />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Activity} label={t('ai.calls')} value={snapshot.callsMade ?? 0} />
        <StatCard icon={Sparkles} tone="green" label={t('ai.cacheHits')} value={snapshot.cacheHits ?? 0} />
        <StatCard icon={AlertTriangle} tone="rose" label={t('ai.failures')} value={snapshot.failures ?? 0} />
        <StatCard
          icon={Timer}
          tone="amber"
          label={t('ai.lastLatency')}
          value={snapshot.lastLatencyMs != null ? `${snapshot.lastLatencyMs} ms` : '—'}
        />
      </div>

      <Card>
        <SectionTitle title={`${t('ai.model')} · ${t('ai.keys')}`} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/40">
            <p className="text-xs font-bold uppercase text-slate-400">{t('ai.model')}</p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{health.model}</p>
            <p className="mt-2 text-xs text-slate-400">
              {t('ai.keys')}: <span className="font-bold">{health.configuredKeys}</span> / 3
              {health.configuredKeys === 0 && <span className="mt-1 block text-amber-600 dark:text-amber-400">⚠ {t('ai.noKeyNote')}</span>}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/40">
            <p className="text-xs font-bold uppercase text-slate-400">Rate limits</p>
            <ul className="mt-1.5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <li>≤ {GEMINI.RATE_LIMIT_PER_MIN} calls / min (client limiter)</li>
              <li>{GEMINI.TIMEOUT_MS / 1000}s timeout · ≤ {GEMINI.MAX_ATTEMPTS} attempts</li>
              <li>cache TTL {GEMINI.CACHE_TTL_MS / 60000} min · cooldown {GEMINI.COOLDOWN_BASE_MS / 1000}s → 2× (max 15 min)</li>
            </ul>
          </div>
        </div>

        {(health.byKey || []).length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {health.byKey.map((k) => (
              <div key={k.idx} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800 dark:text-slate-100">
                  <KeyRound size={13} aria-hidden="true" />
                  {k.label || t('ai.keyStatus', { n: k.idx + 1 })}
                </p>
                <p className="mt-1.5">
                  {k.cooling ? (
                    <Badge tone="amber">{t('ai.cooling', { s: k.cooldownLeftSec })}</Badge>
                  ) : (
                    <Badge tone="green">{t('ai.active')}</Badge>
                  )}
                </p>
                <p className="mt-1.5 text-xs text-slate-400">
                  {t('ai.calls')}: {k.calls} · {t('ai.failures')}: {k.failures}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="Diagnostics" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={runTest} loading={testing}>
            <Send size={15} aria-hidden="true" />
            {t('ai.testCall')}
          </Button>
          <Button variant="secondary" onClick={clearCache}>
            <Trash2 size={15} aria-hidden="true" />
            {t('ai.clearCache')}
          </Button>
        </div>
        {testResult && (
          <p
            role="status"
            className={`mt-3 rounded-xl p-3 text-sm font-semibold ${
              testResult.ok
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            }`}
          >
            {testResult.ok ? t('ai.testOk', { ms: testResult.ms }) : `${t('ai.testFail')} (${testResult.error})`}
          </p>
        )}
        {snapshot.lastError && (
          <p className="mt-2 text-xs text-slate-400">
            {t('ai.lastError')}: <span className="font-mono">{snapshot.lastError}</span>
          </p>
        )}
      </Card>

      <Card className="flex items-start gap-3">
        <span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <p className="font-bold text-slate-700 dark:text-slate-200">🔒 {t('ai.privacyNote')}</p>
          <p className="mt-1 text-xs">
            Key values are never rendered anywhere in this panel — only per-key counters and cooling status.
            Frontend keys are visible in DevTools: restrict them by HTTP-referrer in Google AI Studio and use
            demo/college keys only.
          </p>
        </div>
      </Card>
    </div>
  );
}
