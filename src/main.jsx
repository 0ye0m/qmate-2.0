import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import './index.css';

// Service worker registration can be disabled per-environment (VITE_PWA=off)
// to keep hosted previews cache-clean while iterating. Default: on.
if (import.meta.env.VITE_PWA !== 'off') {
  registerSW({ immediate: true });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
