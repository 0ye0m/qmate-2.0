import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ListChecks, Radio, CalendarClock, BarChart3, Leaf, Ticket } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { useAuthStore } from '../../store/authStore';
import { ROLE_RANK } from '../../utils/constants';

const STUDENT_ITEMS = [
  { to: '/app/dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/app/queues', key: 'nav.activeQueues', icon: ListChecks },
  { to: '/app/status', key: 'nav.queueStatus', icon: Radio },
  { to: '/app/prebook', key: 'nav.prebook', icon: CalendarClock },
  { to: '/app/my-queues', key: 'nav.myQueues', icon: Ticket },
];

const ADMIN_ITEMS = [
  { to: '/app/admin', key: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/app/admin/queues', key: 'nav.manageQueues', icon: ListChecks },
  { to: '/app/admin/analytics', key: 'nav.analytics', icon: BarChart3 },
  { to: '/app/admin/sustainability', key: 'nav.sustainability', icon: Leaf },
  { to: '/app/admin/my-queues', key: 'nav.myQueues', icon: Ticket },
];

/** Mobile bottom navigation (<lg), thumb-friendly 44px targets. */
export default function MobileNav() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user && ROLE_RANK[user.role] >= ROLE_RANK.admin;
  const items = isAdmin ? ADMIN_ITEMS : STUDENT_ITEMS;

  return (
    <nav
      aria-label={t('a11y.sidebar')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/95 lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-bold transition-colors ${
                isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <Icon size={20} aria-hidden="true" />
            <span className="max-w-full truncate">{t(key)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
