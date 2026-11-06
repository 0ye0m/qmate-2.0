import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Wand2, Pause, Play, Square, RotateCcw, Terminal, Pencil } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useQueueStore } from '../../store/queueStore';
import { useI18n } from '../../i18n/I18nProvider';
import { parseQueueFromText } from '../../services/ai/aiFeatures';
import { createQueue, updateQueue, setQueueStatus } from '../../services/queue/queueService';
import { describeError } from '../../utils/errors';
import Card, { SectionTitle } from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { Input, Select, Textarea } from '../../components/common/Input';
import StatusPill from '../../components/common/StatusPill';
import { DEPARTMENTS } from '../../utils/constants';

const EMPTY_FORM = {
  name: '',
  department: 'CSE',
  description: '',
  countersCount: 1,
  maxSlots: 60,
  from: '09:00',
  to: '17:00',
  avgServiceMin: 5,
  requiredDocs: [],
};

export function QueueFormModal({ open, onClose, editing, prefill, onSaved }) {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState(EMPTY_FORM);
  const [docInput, setDocInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        department: editing.department,
        description: editing.description || '',
        countersCount: editing.countersCount,
        maxSlots: editing.maxSlots,
        from: editing.serviceWindow?.from || '09:00',
        to: editing.serviceWindow?.to || '17:00',
        avgServiceMin: editing.avgServiceMin || 5,
        requiredDocs: [...(editing.requiredDocs || [])],
      });
    } else if (prefill) {
      setForm({
        ...EMPTY_FORM,
        name: prefill.name || '',
        department: prefill.department || 'CSE',
        countersCount: prefill.counters || 1,
        maxSlots: prefill.maxSlots || 60,
        from: prefill.from || '09:00',
        to: prefill.to || '17:00',
        requiredDocs: prefill.docs || [],
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editing, prefill, open]);

  const addDoc = () => {
    const v = docInput.trim();
    if (!v) return;
    setForm((f) => ({ ...f, requiredDocs: [...f.requiredDocs, v].slice(0, 12) }));
    setDocInput('');
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        department: form.department,
        description: form.description,
        countersCount: Number(form.countersCount),
        maxSlots: Number(form.maxSlots),
        serviceWindow: { from: form.from, to: form.to },
        avgServiceMin: Number(form.avgServiceMin),
        requiredDocs: form.requiredDocs,
      };
      if (editing) await updateQueue(user, editing.id, payload);
      else await createQueue(user, payload);
      toast.success(t('common.save'));
      onSaved?.();
      onClose();
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
      size="lg"
      title={editing ? t('admin.queues.edit') : t('admin.queues.create')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={busy} disabled={form.name.trim().length < 3}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('admin.queues.qName')}
          name="qName"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="sm:col-span-2"
        />
        <Select
          label={t('admin.queues.qDept')}
          name="qDept"
          value={form.department}
          onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
          options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
        />
        <Input
          label={t('admin.queues.qAvg')}
          name="qAvg"
          type="number"
          min={1}
          max={60}
          value={form.avgServiceMin}
          onChange={(e) => setForm((f) => ({ ...f, avgServiceMin: e.target.value }))}
        />
        <Input
          label={t('admin.queues.qCounters')}
          name="qCounters"
          type="number"
          min={1}
          max={10}
          value={form.countersCount}
          onChange={(e) => setForm((f) => ({ ...f, countersCount: e.target.value }))}
        />
        <Input
          label={t('admin.queues.qSlots')}
          name="qSlots"
          type="number"
          min={10}
          max={999}
          value={form.maxSlots}
          onChange={(e) => setForm((f) => ({ ...f, maxSlots: e.target.value }))}
        />
        <Input
          label={t('admin.queues.qFrom')}
          name="qFrom"
          type="time"
          value={form.from}
          onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
        />
        <Input
          label={t('admin.queues.qTo')}
          name="qTo"
          type="time"
          value={form.to}
          onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
        />
        <Textarea
          label={t('admin.queues.qDesc')}
          name="qDesc"
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="sm:col-span-2"
        />
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t('admin.queues.qDocs')}
            <span className="block text-xs font-normal text-slate-400">{t('admin.queues.qDocsHint')}</span>
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {form.requiredDocs.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setForm((f) => ({ ...f, requiredDocs: f.requiredDocs.filter((x) => x !== d) }))}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-rose-100 hover:text-rose-600 dark:bg-slate-700 dark:text-slate-200"
              >
                {d} ✕
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              name="docInput"
              value={docInput}
              onChange={(e) => setDocInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDoc();
                }
              }}
              placeholder={t('admin.queues.addDoc')}
              className="flex-1"
            />
            <Button variant="secondary" onClick={addDoc}>
              <Plus size={15} />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Manage Queues — NL creation bar + full lifecycle controls. */
export default function ManageQueues() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const queues = useQueueStore((s) => s.queues);
  const stats = useQueueStore((s) => s.stats);
  const refresh = useQueueStore((s) => s.refresh);
  const [nlText, setNlText] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const parseNl = async () => {
    if (!nlText.trim()) return;
    setNlBusy(true);
    try {
      const res = await parseQueueFromText(nlText);
      setPrefill(res);
      setFormOpen(true);
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setNlBusy(false);
    }
  };

  const doStatus = async (queue, status) => {
    setBusyId(queue.id);
    try {
      await setQueueStatus(user, queue.id, status);
      await refresh({ queues: true, mine: false });
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('admin.queues.title')}</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setPrefill(null);
            setFormOpen(true);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          {t('admin.queues.create')}
        </Button>
      </div>

      <Card>
        <SectionTitle title={`✨ ${t('admin.queues.nlTitle')}`} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            name="nlQueue"
            rows={2}
            placeholder={t('admin.queues.nlPh')}
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            className="flex-1"
          />
          <div className="flex sm:flex-col">
            <Button onClick={parseNl} loading={nlBusy} disabled={!nlText.trim()} className="h-full sm:w-40">
              <Wand2 size={15} aria-hidden="true" />
              {t('admin.queues.nlParse')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {queues.map((q) => {
          const st = stats[q.id] || {};
          const full = (st.slotsUsed ?? 0) >= q.maxSlots;
          return (
            <Card key={q.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-slate-900 dark:text-white">{q.name}</h3>
                  <p className="text-xs font-semibold uppercase text-brand-600 dark:text-brand-400">{q.department}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill status={q.status} kind="queue" />
                  {full && q.status === 'paused' && <Badge tone="amber">auto</Badge>}
                </div>
              </div>

              <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{q.description}</p>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-900/40">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{t('admin.queues.qCounters')}</p>
                  <p className="text-sm font-extrabold">{q.countersCount}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-900/40">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{t('admin.queues.qSlots')}</p>
                  <p className="text-sm font-extrabold">
                    {st.slotsUsed ?? 0}/{q.maxSlots}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-900/40">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{t('common.waiting')}</p>
                  <p className="text-sm font-extrabold">{st.waiting ?? 0}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-900/40">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{t('queues.eta', { eta: '' }).trim()}</p>
                  <p className="text-sm font-extrabold">{st.etaMin != null ? `${st.etaMin}m` : '—'}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                <Link
                  to={`/app/admin/queues/${q.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
                >
                  <Terminal size={13} aria-hidden="true" />
                  {t('admin.queues.console')}
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(q);
                    setFormOpen(true);
                  }}
                >
                  <Pencil size={13} aria-hidden="true" />
                  {t('common.edit')}
                </Button>
                {q.status === 'active' && (
                  <Button size="sm" variant="ghost" loading={busyId === q.id} onClick={() => doStatus(q, 'paused')}>
                    <Pause size={13} aria-hidden="true" />
                    {t('admin.queues.pause')}
                  </Button>
                )}
                {q.status === 'paused' && (
                  <Button size="sm" variant="success" loading={busyId === q.id} onClick={() => doStatus(q, 'active')}>
                    <Play size={13} aria-hidden="true" />
                    {t('admin.queues.resume')}
                  </Button>
                )}
                {q.status === 'scheduled' && (
                  <Button size="sm" variant="success" loading={busyId === q.id} onClick={() => doStatus(q, 'active')}>
                    <Play size={13} aria-hidden="true" />
                    {t('admin.queues.reopen')}
                  </Button>
                )}
                {['active', 'paused', 'scheduled'].includes(q.status) && (
                  <Button size="sm" variant="ghost" loading={busyId === q.id} onClick={() => doStatus(q, 'completed')}>
                    <Square size={13} aria-hidden="true" />
                    {t('admin.queues.closeEarly')}
                  </Button>
                )}
                {['completed', 'inactive'].includes(q.status) && (
                  <Button size="sm" variant="secondary" loading={busyId === q.id} onClick={() => doStatus(q, 'active')}>
                    <RotateCcw size={13} aria-hidden="true" />
                    {t('admin.queues.reopen')}
                  </Button>
                )}
              </div>
              {q.status === 'paused' && q.pausedReason === 'full' && (
                <p className="mt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">{t('admin.queues.autoClosed')}</p>
              )}
            </Card>
          );
        })}
      </div>

      <QueueFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        prefill={prefill}
        onSaved={() => refresh({ queues: true, mine: false })}
      />
    </div>
  );
}
