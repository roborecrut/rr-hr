import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// R2 Block 8: build marker — proves the running JS bundle matches the latest
// build. The build_id is injected by Vite (`__APP_VERSION__` in vite.config.ts)
// and changes on every rebuild, so a stale tab caching old chunks is visible
// in console.
declare const __APP_VERSION__: string;
try {
  // eslint-disable-next-line no-console
  console.info('[rr_build]', { build_id: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown' });
} catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
