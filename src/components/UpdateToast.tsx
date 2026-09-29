import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Listens for the `beep-sw-update` event dispatched by sw-register.ts.
 * Tapping Refresh tells the waiting service worker to take over, then
 * reloads the page on `controllerchange`.
 */
export function UpdateToast() {
  const [waiting, setWaiting] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const onUpdate = (event: Event) =>
      setWaiting((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener('beep-sw-update', onUpdate);
    return () => window.removeEventListener('beep-sw-update', onUpdate);
  }, []);

  if (!waiting) return null;

  const applyUpdate = () => {
    const registration = waiting;
    setWaiting(null);
    const reload = () => window.location.reload();
    window.addEventListener('controllerchange', reload, { once: true });
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      // Safety net in case controllerchange never fires.
      window.setTimeout(reload, 3000);
    } else {
      reload();
    }
  };

  return (
    <div className="fixed inset-x-0 top-16 z-40 mx-auto flex w-fit max-w-md items-center gap-3 rounded-full border border-slate-700 bg-slate-800 px-4 py-2.5 shadow-lg shadow-black/40">
      <span className="text-sm text-slate-200">New version available</span>
      <button
        onClick={applyUpdate}
        className="flex items-center gap-1.5 rounded-full bg-lime-400 px-3 py-1 text-xs font-bold text-slate-950 transition active:scale-95"
      >
        <RefreshCw size={12} /> Refresh
      </button>
    </div>
  );
}
