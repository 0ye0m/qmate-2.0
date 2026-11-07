import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ListChecks,
  Ticket,
  CalendarClock,
  Radio,
  LifeBuoy,
  Settings,
  Users,
  BarChart3,
  Leaf,
  Sparkles,
  ScrollText,
  X,
  Leaf as LeafIcon,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { useAuthStore } from '../../store/authStore';
import { ROLE_RANK } from '../../utils/constants';
import { APP } from '../../utils/constants';

const STUDENT_LINKS = [
  { to: '/app/dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/app/queues', key: 'nav.activeQueues', icon: ListChecks },
  { to: '/app/my-queues', key: 'nav.myQueues', icon: Ticket },
  { to: '/app/prebook', key: 'nav.prebook', icon: CalendarClock },
  { to: '/app/status', key: 'nav.queueStatus', icon: Radio },
  { to: '/app/help', key: 'nav.help', icon: LifeBuoy },
  { to: '/app/settings', key: 'nav.settings', icon: Settings },
];

const ADMIN_LINKS = [
  { to: '/app/admin', key: 'nav.adminDashboard', icon: LayoutDashboard },
  { to: '/app/admin/queues', key: 'nav.manageQueues', icon: ListChecks },
  { to: '/app/admin/users', key: 'nav.manageUsers', icon: Users },
  { to: '/app/admin/my-queues', key: 'nav.myQueues', icon: Ticket },
  { to: '/app/admin/prebooking', key: 'nav.prebooking', icon: CalendarClock },
  { to: '/app/admin/analytics', key: 'nav.analytics', icon: BarChart3 },
  { to: '/app/admin/sustainability', key: 'nav.sustainability', icon: Leaf },
  { to: '/app/admin/ai-health', key: 'nav.aiHealth', icon: Sparkles },
  { to: '/app/admin/audit', key: 'nav.auditLog', icon: ScrollText },
];

export default function Sidebar({ open, onClose }) {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user && ROLE_RANK[user.role] >= ROLE_RANK.admin;
  const links = isAdmin ? ADMIN_LINKS : STUDENT_LINKS;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/70 bg-white transition-transform duration-200 dark:border-slate-700/60 dark:bg-slate-900 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label={t('a11y.sidebar')}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <NavLink to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md">
              <LeafIcon size={18} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-extrabold leading-none text-slate-900 dark:text-white">
                {APP.name}
              </span>
              <span className="block text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                {APP.tagline}
              </span>
            </span>
          </NavLink>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('nav.menu')}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {links.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              <Icon size={17} aria-hidden="true" />
              {t(key)}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200/70 px-5 py-4 text-xs text-slate-400 dark:border-slate-700/60 dark:text-slate-500">
          {APP.name} · cloud-synced PWA
        </div>
      </aside>
    </>
  );
}
