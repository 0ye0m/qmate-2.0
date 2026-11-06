import Badge, { QUEUE_TONE, TOKEN_TONE } from './Badge';
import { useI18n } from '../../i18n/I18nProvider';

/** Colored, translated status pill for queues and tokens. */
export default function StatusPill({ status, kind = 'token' }) {
  const { t } = useI18n();
  const key = kind === 'queue' ? `common.${status}` : `common.${status}`;
  const tone = (kind === 'queue' ? QUEUE_TONE : TOKEN_TONE)[status] || 'slate';
  return <Badge tone={tone}>{t(key)}</Badge>;
}
