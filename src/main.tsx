import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { captureAttribution } from './lib/attribution';

// Before React mounts: a tagged link is only tagged for as long as the URL
// says so, and the answer to "which mailing worked" cannot be reconstructed
// afterwards.
captureAttribution();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
