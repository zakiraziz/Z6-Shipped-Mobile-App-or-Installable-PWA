/**
 * Registers the service worker (production builds only) and lets the UI know
 * when a new version is waiting. The app posts SKIP_WAITING when the user
 * taps "Refresh" in the update toast, then reloads on `controllerchange`.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        // A new SW can already be WAITING by the time we attach listeners
        // (fast network / reload race) — announce it immediately too.
        const announceIfWaiting = () => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('beep-sw-update', { detail: registration }));
          }
        };
        announceIfWaiting();

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            const isInstalled = installing.state === 'installed';
            // A controller means this is an update, not the first install.
            if (isInstalled && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('beep-sw-update', { detail: registration }));
            }
          });
        });
      })
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
}
