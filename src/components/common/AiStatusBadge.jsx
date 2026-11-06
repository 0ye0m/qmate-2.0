import { Activity, Bot, CircleOff } from 'lucide-react';
import { useAiStore } from '../../store/aiStore';
import { aiMode } from '../../services/ai/geminiClient';
import { useI18n } from '../../i18n/I18nProvider';

/** Small "AI: Online / Fallback / Off" indicator — never shows key values. */
export default function AiStatusBadge({ compact = false }) {
  const { t } = useI18n();
  const mode = useAiStore((s) => s.mode);
  const current = mode || aiMode();
  const map = {
    online: { icon: Activity, tone: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300', label: t('ai.modeOnline') },
    fallback: { icon: Bot, tone: 'text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300', label: t('ai.modeFallback') },
    off: { icon: CircleOff, tone: 'text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-300', label: t('ai.modeOff') },
  };
  const { icon: Icon, tone, label } = map[current] || map.off;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}
      title={t('ai.privacyNote')}
    >
      <Icon size={12} aria-hidden="true" />
      {compact ? label.replace('AI: ', '') : label}
    </span>
  );
}
