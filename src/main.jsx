import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

window.addEventListener('error', (event) => {
  console.error('[Global Error Caught]:', event.error);
  const root = document.getElementById('root');
  if (root && root.innerHTML.includes('Caricamento')) {
    root.innerHTML = `<div style="padding: 24px; color: #dc2626; font-family: sans-serif; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin: 20px;">
      <h2 style="font-weight: bold; margin-bottom: 8px;">Errore durante il caricamento dell'applicazione</h2>
      <pre style="white-space: pre-wrap; font-size: 13px;">${event.error?.stack || event.message}</pre>
    </div>`;
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
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-blocking fallback when SW registration is unavailable
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
