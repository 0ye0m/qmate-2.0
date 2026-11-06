import { useEffect, useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { useNow } from '../../hooks/useEventBus';
import { calledTokens } from '../../services/queue/queueService';
import { eventBus, EVENTS } from '../../services/realtime/EventBus';
import { countdown } from '../../utils/format';

/**
 * Live "Now Serving" banner for one queue — per-counter current tokens.
 * aria-live so screen readers announce calls. Event-driven updates (no
 * polling): reloads only on TOKEN_* events for the affected queue.
 */
export default function NowServingBanner({ queueId, title }) {
  const { t } = useI18n();
  const now = useNow(1000);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      calledTokens(queueId)
        .then((r) => {
          if (alive) setRows(r);
        })
        .catch(() => {});
    };
    load();
    const unsub = eventBus.on((msg) => {
      if (
        [
          EVENTS.TOKEN_CALLED,
          EVENTS.TOKEN_SERVING,
          EVENTS.TOKEN_COMPLETED,
          EVENTS.TOKEN_SKIPPED,
          EVENTS.TOKEN_NO_SHOW,
        ].includes(msg.type)
      ) {
        load();
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [queueId]);

  return (
    <div
      className="rounded-2xl bg-gradient-to-r from-brand-700 to-brand-900 p-4 text-white shadow-md"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-200">
        <MonitorPlay size={14} aria-hidden="true" />
        {title || t('status.nowServing')}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-brand-200">—</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
              <span className="text-xl font-extrabold tracking-tight">#{r.number}</span>
              <span className="text-xs text-brand-100">
                {r.counterLabel || '—'}
                {r.status === 'called' && r.graceUntil ? ` · ${countdown(r.graceUntil - now)}` : ''}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
