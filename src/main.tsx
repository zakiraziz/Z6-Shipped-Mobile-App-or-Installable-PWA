import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './sw-register';
import { noteUserGesture } from './lib/cues';
import './index.css';

// Activation tracking: Chrome blocks (and logs) vibrate() before the first tap.
window.addEventListener('pointerdown', noteUserGesture, { once: true, capture: true });
window.addEventListener('keydown', noteUserGesture, { once: true, capture: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerServiceWorker();
