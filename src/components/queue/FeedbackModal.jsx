import { useState } from 'react';
import toast from 'react-hot-toast';
import { Star } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Textarea } from '../common/Input';
import { add as addFeedback } from '../../services/queue/feedbackService';
import { describeError } from '../../utils/errors';
import { useI18n } from '../../i18n/I18nProvider';

/** Post-visit feedback: 1–5 stars + optional comment (anonymized for AI). */
export default function FeedbackModal({ open, onClose, token }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  if (!token) return null;

  const submit = async () => {
    if (!rating) return;
    setBusy(true);
    try {
      await addFeedback({
        tokenId: token.id,
        queueId: token.queueId,
        userId: token.userId,
        rating,
        comment,
      });
      toast.success(t('history.thanks'));
      onClose?.();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('history.feedbackTitle')} — ${token.code}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button disabled={!rating} loading={busy} onClick={submit}>
            {t('common.submit')}
          </Button>
        </>
      }
    >
      <div className="flex justify-center gap-2 py-4" role="radiogroup" aria-label={t('history.rate')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)}
            className="rounded-full p-1.5 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Star
              size={34}
              className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}
            />
          </button>
        ))}
      </div>
      <Textarea
        name="feedbackComment"
        label={t('history.commentLabel')}
        placeholder={t('history.commentPh')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={400}
      />
    </Modal>
  );
}
