import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { installStaticFetchInterceptor } from './services/apiClient.js';

installStaticFetchInterceptor();

window.addEventListener('error', (event) => {
  console.error('[Global Error Caught]:', event.error);
  const root = document.getElementById('root');
  if (root && root.textContent && root.textContent.includes('Caricamento')) {
    const box = document.createElement('div');
    box.style.cssText =
      'padding: 24px; color: #dc2626; font-family: sans-serif; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin: 20px;';
    const heading = document.createElement('h2');
    heading.style.cssText = 'font-weight: bold; margin-bottom: 8px;';
    heading.textContent = "Errore durante il caricamento dell'applicazione";
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space: pre-wrap; font-size: 13px;';
    pre.textContent = String(event.error?.stack || event.message || 'Errore sconosciuto');
    box.append(heading, pre);
    root.replaceChildren(box);
  }
});

if (
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator
) {
  window.addEventListener('load', () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
    const registerPromise =
      import.meta.env.VITE_STATIC_MODE === 'true'
        ? navigator.serviceWorker.register(`${import.meta.env.BASE_URL || './'}sw.js`)
        : navigator.serviceWorker.register('/sw.js');
    registerPromise
      .then((reg) => reg?.update?.())
      .catch(() => {
        // Non-blocking fallback when SW registration is unavailable
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
