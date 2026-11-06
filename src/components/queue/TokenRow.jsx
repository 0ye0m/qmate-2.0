import { MapPin, Timer, CheckCheck, XCircle, AlertTriangle, Star } from 'lucide-react';
import StatusPill from '../common/StatusPill';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { fmtDateTime, fmtMinutes } from '../../utils/format';
import { TOKEN_STATUS } from '../../utils/constants';
import { useI18n } from '../../i18n/I18nProvider';

/** Compact token row for history lists (My Queues → past visits). */
export default function TokenRow({ token, feedback, onRate }) {
  const { t } = useI18n();
  const done = token.status === TOKEN_STATUS.COMPLETED;
  // capitalize so it renders as a JSX component (lucide icons are
  // forwardRef objects — calling them as functions throws at runtime)
  const Icon =
    token.status === TOKEN_STATUS.NO_SHOW || token.status === TOKEN_STATUS.SKIPPED
      ? XCircle
      : token.status === TOKEN_STATUS.CANCELLED
        ? AlertTriangle
        : CheckCheck;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-800/70">
      <span
        className={`rounded-xl p-2 ${
          done
            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
        }`}
        aria-hidden="true"
      >
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{token.code}</span>
          <span className="truncate text-sm text-slate-500 dark:text-slate-400">{token.queueName}</span>
          <StatusPill status={token.status} />
          {token.priority && token.priority !== 'none' && <Badge tone="violet">{t('common.priority')}</Badge>}
          {token.joinedRemote && (
            <Badge tone="green">
              <MapPin size={10} aria-hidden="true" /> remote
            </Badge>
          )}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
          {fmtDateTime(token.completedAt || token.cancelledAt || token.issuedAt)}
          {token.waitSeconds != null && (
            <span className="inline-flex items-center gap-1">
              <Timer size={11} aria-hidden="true" />
              {t('history.waited', { min: fmtMinutes(token.waitSeconds / 60) })}
            </span>
          )}
          {token.serviceSeconds != null && (
            <span>{t('history.served', { min: fmtMinutes(token.serviceSeconds / 60) })}</span>
          )}
        </span>
      </span>
      {done &&
        (feedback ? (
          <Badge tone="amber">
            <Star size={11} aria-hidden="true" /> {feedback.rating}★
          </Badge>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onRate?.(token)}>
            <Star size={13} aria-hidden="true" />
            {t('history.rate')}
          </Button>
        ))}
    </li>
  );
}
