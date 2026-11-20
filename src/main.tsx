import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support. Only in production builds: in dev the service worker
// would serve stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js');
    // Warm the cache with the export/import code, so it works offline even
    // if it has never been used. Off the startup path.
    setTimeout(() => void import('fflate'), 3000);
  });
}
