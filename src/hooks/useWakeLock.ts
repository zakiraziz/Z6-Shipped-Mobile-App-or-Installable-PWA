import { useEffect, useRef } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

/**
 * Keeps the screen on while a session runs (Wake Lock API — Chrome/Edge on
 * Android, desktop Chrome). The browser RELEASES the sentinel when the tab is
 * hidden or the screen locks (iOS Safari always does on background) — so the
 * visibility handler re-requests whenever the old one is no longer held.
 * Where unsupported this is a silent no-op.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };

    const acquire = async () => {
      if (!nav.wakeLock || cancelled) return;
      // Already held → nothing to do. Released (browser took it back) → fall
      // through and re-request; keeping a stale ref here was a real bug.
      if (sentinelRef.current && !sentinelRef.current.released) return;
      sentinelRef.current = null;
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
