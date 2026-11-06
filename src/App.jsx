import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nProvider';
import { AppRouter } from './app/router';
import { useTheme } from './hooks/useTheme';
import { useUiStore } from './store/uiStore';
import { useAuthStore } from './store/authStore';
import { useQueueStore, bindQueueStore } from './store/queueStore';
import { initStorage } from './services/storage';
import { ensureSeeded } from './services/seed/seed';
import { eventBus, EVENTS } from './services/realtime/EventBus';
import * as simulator from './services/simulator/demoSimulator';

/**
 * Q-Mate 2.0 — boot sequence:
 *   storage → seed → auth restore → live bindings → router.
 * The index.html splash is removed once the app is ready.
 */
export default function App() {
  useTheme();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await initStorage();
        const seeded = await ensureSeeded();
        await useAuthStore.getState().boot();
        bindQueueStore();
        if (useAuthStore.getState().user) {
          await useQueueStore.getState().refresh({ queues: true, mine: true, announcements: true });
        }
        if (seeded) eventBus.publish(EVENTS.DATA_SEEDED, {});
        // resume simulator if the admin left it on (respect Eco Mode)
        const ui = useUiStore.getState();
        if (ui.simulator && !ui.eco) simulator.start();
      } catch (err) {
        console.error('[boot] failed', err);
      } finally {
        if (alive) {
          document.getElementById('boot-splash')?.remove();
        }
      }
    })();
    return () => {
      alive = false;
      simulator.stop();
    };
  }, []);

  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppRouter />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '14px',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: '14px',
              fontWeight: 600,
              maxWidth: '420px',
            },
            success: { iconTheme: { primary: '#14b8a6', secondary: '#f8fafc' } },
            error: { iconTheme: { primary: '#f43f5e', secondary: '#f8fafc' } },
          }}
        />
      </I18nProvider>
    </ErrorBoundary>
  );
}
