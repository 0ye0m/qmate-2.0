import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import Button from '../common/Button';
import DocumentChecklist from './DocumentChecklist';
import { joinQueue } from '../../services/queue/queueService';
import { describeError } from '../../utils/errors';
import { useI18n } from '../../i18n/I18nProvider';
import { useUiStore } from '../../store/uiStore';
import { PRIORITY_TYPES } from '../../utils/constants';

const PRIORITY_LABELS = {
  'differently-abled': '♿ Differently-abled',
  emergency: '🚨 Emergency',
  faculty: '🎓 Faculty / Staff',
};

/**
 * Join flow: document checklist → optional priority + remote-wait →
 * transactional join. Blocks confirm until all checklist items are ticked.
 */
export default function JoinFlowModal({ open, onClose, queue, user, onJoined }) {
  const { t, lang } = useI18n();
  const travelMinutes = useUiStore((s) => s.travelMinutes);
  const [joined, setJoined] = useState(false);
  const [priority, setPriority] = useState('none');
  const [remote, setRemote] = useState(true);
  const [docsOk, setDocsOk] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!queue || !user) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      const token = await joinQueue({
        queueId: queue.id,
        user,
        opts: {
          remote: remote && travelMinutes > 0,
          priority,
          docsAcknowledged: true,
        },
      });
      toast.success(t('queues.joinedToast', { n: token.number }));
      setJoined(true);
      onJoined?.(token);
      onClose();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${t('queues.checklistTitle')} — ${queue.name}`} size="lg">
      <DocumentChecklist queue={queue} lang={lang} />

      <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-900/40">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={docsOk}
            onChange={(e) => setDocsOk(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          {t('queues.acknowledge')}
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={remote}
            onChange={(e) => setRemote(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          {t('status.leaveNowDesc', { min: travelMinutes })} 🌿
        </label>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t('queues.priorityJoin')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPriority('none')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                priority === 'none'
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'
              }`}
            >
              {t('common.standard')}
            </button>
            {PRIORITY_TYPES.filter((p) => p !== 'none').map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                  priority === p
                    ? 'bg-amber-500 text-white ring-amber-500'
                    : 'bg-white text-slate-600 ring-slate-200 hover:ring-amber-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'
                }`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
          {priority !== 'none' && (
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{t('queues.priorityNote')}</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button disabled={!docsOk || joined} loading={busy} onClick={confirm}>
          {t('queues.confirmJoin')}
        </Button>
      </div>
    </Modal>
  );
}
