import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, Search, Lock, Unlock, Trash2, ShieldCheck, ShieldOff, Download } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../i18n/I18nProvider';
import { listUsers, setUserRole, setUserStatus, deleteUser } from '../../services/auth/authService';
import { exportUsersCsv } from '../../services/export/exportService';
import { describeError } from '../../utils/errors';
import { useEventBus } from '../../hooks/useEventBus';
import Card, { SectionTitle } from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { Input } from '../../components/common/Input';
import { ROLE_RANK } from '../../utils/constants';
import { EVENTS } from '../../services/realtime/EventBus';
import { fmtDate } from '../../utils/format';
import { ROLE_LABELS } from '../../components/layout/roleLabels';

export default function ManageUsers() {
  const { t } = useI18n();
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);

  const isSuper = ROLE_RANK[me.role] >= ROLE_RANK.super;

  const load = async () => {
    try {
      setUsers(await listUsers());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEventBus((msg) => {
    if (msg.type === EVENTS.USER_UPDATED) load();
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  }, [users, query]);

  const run = async (id, fn, msg) => {
    setBusyId(id);
    try {
      await fn();
      if (msg) toast.success(msg);
      await load();
    } catch (err) {
      toast.error(t(`errors.${describeError(err)}`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('users.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              name="userSearch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('users.searchPh')}
              className="w-52"
              aria-label={t('common.search')}
            />
          </div>
          <Button variant="secondary" onClick={() => exportUsersCsv(me).catch((e) => toast.error(t(`errors.${describeError(e)}`)))}>
            <Download size={15} aria-hidden="true" />
            {t('common.export')}
          </Button>
        </div>
      </div>

      {!isSuper && <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">⚠ {t('users.superOnly')}</p>}

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title={t('users.title')} />
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="px-4 py-3">{t('auth.name')}</th>
                  <th className="px-4 py-3">{t('auth.email')}</th>
                  <th className="px-4 py-3">{t('auth.department')}</th>
                  <th className="px-4 py-3">{t('users.role')}</th>
                  <th className="px-4 py-3">{t('common.status')}</th>
                  <th className="px-4 py-3 text-right">{t('common.view')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-900 dark:text-white">{u.name}</span>
                      {u.year ? <span className="ml-1 text-xs text-slate-400">Y{u.year}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{u.department}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === 'student' ? 'teal' : 'violet'}>{ROLE_LABELS[u.role] || u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.status === 'active' ? 'green' : 'rose'}>{u.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {isSuper && u.id !== me.id && (
                          <>
                            {u.role === 'student' ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busyId === u.id}
                                onClick={() => run(u.id, () => setUserRole(me, u.id, 'admin'), t('users.updated'))}
                              >
                                <ShieldCheck size={13} aria-hidden="true" />
                                {t('users.promote')}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busyId === u.id}
                                onClick={() => run(u.id, () => setUserRole(me, u.id, 'student'), t('users.updated'))}
                              >
                                <ShieldOff size={13} aria-hidden="true" />
                                {t('users.demote')}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === u.id}
                              onClick={() => run(u.id, () => deleteUser(me, u.id), t('users.updated'))}
                              aria-label={t('users.delete')}
                            >
                              <Trash2 size={13} className="text-rose-500" aria-hidden="true" />
                            </Button>
                          </>
                        )}
                        {u.role === 'student' &&
                          (u.status === 'active' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === u.id}
                              onClick={() => run(u.id, () => setUserStatus(me, u.id, 'locked'), t('users.updated'))}
                            >
                              <Lock size={13} aria-hidden="true" />
                              {t('users.lock')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === u.id}
                              onClick={() => run(u.id, () => setUserStatus(me, u.id, 'active'), t('users.updated'))}
                            >
                              <Unlock size={13} aria-hidden="true" />
                              {t('users.unlock')}
                            </Button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-xs text-slate-400">{users.length} accounts · joined data from {fmtDate(users[0]?.createdAt)}</p>
    </div>
  );
}
