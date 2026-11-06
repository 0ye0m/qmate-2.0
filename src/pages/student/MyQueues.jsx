import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Ticket, DoorOpen } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useQueueStore } from '../../store/queueStore';
import { useI18n } from '../../i18n/I18nProvider';
import { historyForUser, leaveQueue } from '../../services/queue/queueService';
import { myFeedbackFor } from '../../services/queue/feedbackService';
import { describeError } from '../../utils/errors';
import TokenRow from '../../components/queue/TokenRow';
import TokenCard from '../../components/queue/TokenCard';
import FeedbackModal from '../../components/queue/FeedbackModal';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import { SectionTitle } from '../../components/common/Card';
import { LIVE_TOKEN_STATUSES, TOKEN_STATUS } from '../../utils/constants';

/** My Queues: active tokens + full history with outcomes, rating & QR card. */
export default function MyQueues() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const myTokens = useQueueStore((s) => s.myTokens);
  const version = useQueueStore((s) => s.version);
  const [history, setHistory] = useState([]);
  const [feedbackMap, setFeedbackMap] = useState(new Map());
  const [rateToken, setRateToken] = useState(null);
  const [showCard, setShowCard] = useState(null);

  const refreshLocal = async () => {
    try {
      const [h, fb] = await Promise.all([historyForUser(user.id), myFeedbackFor(user.id)]);
      setHistory(h);
      setFeedbackMap(fb);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    refreshLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, version]);

  const active = myTokens.filter((tk) => LIVE_TOKEN_STATUSES.includes(tk.status));

  const doLeave = async (token) => {
    try {
      await leaveQueue(token.id, user.id);
      toast.success(t('queues.leftQueue'));
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    }
  };

  return (
    <div className="space-y-7">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('history.title')}</h1>

      <section>
        <SectionTitle title={t('history.activeNow')} />
        {active.length === 0 ? (
          <EmptyState icon={Ticket} title={t('dash.noToken')} sub={t('dash.noTokenSub')} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((token) => (
              <div key={token.id} className="space-y-2">
                <TokenCard token={token} queue={{ name: token.queueName }} />
                {token.status === TOKEN_STATUS.WAITING && (
                  <Button variant="danger" size="sm" className="w-full" onClick={() => doLeave(token)}>
                    <DoorOpen size={14} aria-hidden="true" />
                    {t('status.leave')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title={t('history.past')} />
        {history.length === 0 ? (
          <EmptyState icon={Ticket} title={t('history.past')} sub={t('history.none')} />
        ) : (
          <ul className="space-y-2.5">
            {history.slice(0, 50).map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                feedback={feedbackMap.get(token.id)}
                onRate={(tk) => setRateToken(tk)}
              />
            ))}
          </ul>
        )}
      </section>

      <FeedbackModal
        open={!!rateToken}
        token={rateToken}
        onClose={() => {
          setRateToken(null);
          refreshLocal();
        }}
      />
    </div>
  );
}
