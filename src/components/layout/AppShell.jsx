import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';
import NotificationWatcher from './NotificationWatcher';
import QBuddy from '../qbuddy/QBuddy';
import { useAuthStore } from '../../store/authStore';
import { useQueueStore } from '../../store/queueStore';

/** Authenticated app frame: sidebar + topbar + routed content + bottom nav. */
export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userId = useAuthStore((s) => s.user?.id);

  // Load the shared live snapshot whenever the signed-in user changes
  // (login, restore, account switch). Event-driven updates continue after.
  useEffect(() => {
    if (!userId) return undefined;
    useQueueStore.getState().refresh({ queues: true, mine: true, announcements: true });
    return undefined;
  }, [userId]);

  useEffect(() => {
    document.documentElement.lang = document.documentElement.lang || 'en';
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <TopBar onMenu={() => setSidebarOpen(true)} />
        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <QBuddy />
      <NotificationWatcher />
    </div>
  );
}
