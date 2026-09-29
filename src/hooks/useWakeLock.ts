import { useEffect, useRef } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * Keeps the screen on while a session runs (Wake Lock API — Chrome/Edge on
 * Android, desktop Chrome). Where unsupported this is a silent no-op, and the
 * sentinel is re-acquired if the tab comes back to the foreground.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };

    const acquire = async () => {
      if (!nav.wakeLock || cancelled || sentinelRef.current) return;
      try {
        sentinelRef.current = await nav.wakeLock.request('screen');
      } catch {
        /* permission denied / unsupported — ignore */
      }
    };

    const release = () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel) sentinel.release().catch(() => undefined);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && active) void acquire();
    };

    if (active) void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      release();
    };
  }, [active]);
}
