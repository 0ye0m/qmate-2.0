import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Installable offline mode is opt-in (VITE_PWA=on builds embed the PWA
// plugin and the virtual:pwa-register module). Hosted builds ship without
// a service worker so every visit gets the freshest bundle.
if (import.meta.env.VITE_PWA === 'on') {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

/**
 * Stale-shell guard — if the browser is executing an older cached bundle
 * than the one currently deployed (mixed versions break multi-tab sync and
 * can miss newer features), reload ONCE to converge on the fresh build.
 * Runs after boot so it never blocks first paint; guarded against loops.
 */
function checkForStaleBundle() {
  try {
    const running = document.querySelector('script[src*="assets/index-"]')?.src || '';
    if (!running) return;
    fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!v?.bundle) return;
        const file = running.split('/').pop();
        if (file && file !== v.bundle && !sessionStorage.getItem('qmate-version-reloaded')) {
          sessionStorage.setItem('qmate-version-reloaded', String(Date.now()));
          window.location.reload();
        }
      })
      .catch(() => {});
  } catch {
    /* never block boot */
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

checkForStaleBundle();
