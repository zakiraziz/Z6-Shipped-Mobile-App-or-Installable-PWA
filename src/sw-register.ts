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
        const announce = () => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('beep-sw-update', { detail: registration }));
          }
        };

        // Race-safe: the update can be in ANY state by the time we attach —
        //  · already waiting        → announce now
        //  · still installing       → watch its statechange (updatefound may
        //                             have fired before this .then ran)
        //  · not started yet        → updatefound listener below
        const watchInstalling = (worker: ServiceWorker | null) => {
          if (!worker) return;
          const onStateChange = () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('beep-sw-update', { detail: registration }));
            }
          };
          worker.addEventListener('statechange', onStateChange);
          onStateChange(); // may have installed in the gap
        };

        announce();
        watchInstalling(registration.installing);

        registration.addEventListener('updatefound', () => {
          watchInstalling(registration.installing);
        });
      })
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
}
