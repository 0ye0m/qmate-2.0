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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
