import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { captureAttribution } from './lib/attribution';
import { installSessionGuard } from './lib/sessionGuard';

// Before React mounts: a tagged link is only tagged for as long as the URL
// says so, and the answer to "which mailing worked" cannot be reconstructed
// afterwards.
captureAttribution();
installSessionGuard();

// Installability and the offline page. Production only: in development a
// service worker would keep serving yesterday's bundle.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* installability is a nicety */ });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
