import { useCallback, useEffect, useRef, useState } from 'react';

const STORE_KEY = 'beep.stopwatch.v1';
/** Snapshot cadence while running — same ~1/s discipline as the sessions. */
const PERSIST_MS = 1000;

type Snapshot = { base: number; at: number; running: boolean; laps: number[] };

function readSnapshot(): { base: number; laps: number[] } | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (typeof parsed.base !== 'number' || !Array.isArray(parsed.laps)) return null;
    return { base: Math.max(0, parsed.base), laps: parsed.laps.filter((v) => typeof v === 'number') };
  } catch {
    return null;
  }
}

export type StopwatchApi = ReturnType<typeof useStopwatch>;

/**
 * The second clock: a count-up stopwatch with laps, anchored on timestamps
 * (never tick counts) exactly like the interval engine, so a throttled tab
 * stays honest. It lives at the state-provider level, so tab switches never
 * stop it, and the snapshot always restores **frozen** — the same
 * "never come back to a secretly running timer" philosophy as session resume.
 */
export function useStopwatch() {
  // Lazy init: localStorage is read once, not on every render.
  const [initial] = useState(readSnapshot);
  const baseRef = useRef(initial?.base ?? 0);
  const atRef = useRef(0);
  const lapsRef = useRef<number[]>(initial?.laps ?? []);
  const lastPersistRef = useRef(0);

  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>(
    baseRef.current > 0 || lapsRef.current.length > 0 ? 'paused' : 'idle'
  );
  const [elapsed, setElapsed] = useState(baseRef.current);
  const [laps, setLaps] = useState<number[]>(lapsRef.current);
  const statusRef = useRef(status);
  statusRef.current = status;

  const persistNow = useCallback(() => {
    const value =
      statusRef.current === 'running'
        ? baseRef.current + (performance.now() - atRef.current)
        : baseRef.current;
    try {
      if (value < 1 && lapsRef.current.length === 0) {
        window.localStorage.removeItem(STORE_KEY);
        return;
      }
      // Stored frozen: whatever happens next, the restore is never running.
      window.localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ base: value, at: 0, running: false, laps: lapsRef.current } satisfies Snapshot)
      );
    } catch {
      /* storage blocked — the stopwatch still works for this session */
    }
  }, []);

  // Ticks only while running; 100ms gives the tenths digit its rhythm.
  useEffect(() => {
    if (status !== 'running') return;
    const id = window.setInterval(() => {
      const value = baseRef.current + (performance.now() - atRef.current);
      setElapsed(value);
      if (performance.now() - lastPersistRef.current >= PERSIST_MS) {
        lastPersistRef.current = performance.now();
        persistNow();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [status, persistNow]);

  // A tab kill / eviction / background flush must not lose the clock.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') persistNow();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', persistNow);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', persistNow);
      persistNow(); // unmount (provider teardown / hot reload)
    };
  }, [persistNow]);

  const start = useCallback(() => {
    atRef.current = performance.now();
    lastPersistRef.current = performance.now();
    setStatus('running');
  }, []);

  const pause = useCallback(() => {
    baseRef.current = baseRef.current + (performance.now() - atRef.current);
    setElapsed(baseRef.current);
    setStatus('paused');
    persistNow();
  }, [persistNow]);

  const toggle = useCallback(() => {
    if (statusRef.current === 'running') pause();
    else start();
  }, [pause, start]);

  const reset = useCallback(() => {
    baseRef.current = 0;
    lapsRef.current = [];
    setElapsed(0);
    setLaps([]);
    setStatus('idle');
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const lap = useCallback(() => {
    if (statusRef.current !== 'running') return;
    const value = baseRef.current + (performance.now() - atRef.current);
    lapsRef.current = [...lapsRef.current, value];
    setLaps(lapsRef.current);
    persistNow();
  }, [persistNow]);

  return { status, elapsed, laps, start, pause, toggle, reset, lap };
}