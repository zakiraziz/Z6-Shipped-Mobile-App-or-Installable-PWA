import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playCountdown, playFinish, playPhaseChange } from '../lib/sound';
import { buildSegments, presetTotalMs } from '../lib/presets';
import type { Preset, Settings, TimerStatus } from '../types';
import type { Segment } from '../types';

export type CompleteInfo = { completed: boolean; elapsedMs: number };

type Location = { index: number; offset: number };

/** Guard so a corrupted preset can never crash the render. */
const FALLBACK_SEGMENT: Segment = { kind: 'work', label: 'Work', round: 1, durationMs: 0 };


/**
 * The timer engine. Elapsed time is derived from timestamps
 * (`anchor.base + performance.now() - anchor.at`) instead of counting ticks,
 * so a throttled background tab catches up exactly when it is visible again.
 * Beeps and vibration are edge-detected against the previous elapsed value.
 */
export function useIntervalTimer(
  preset: Preset,
  settings: Settings,
  onComplete: (info: CompleteInfo) => void
) {
  const segments = useMemo(() => buildSegments(preset), [preset]);
  const totalMs = useMemo(() => presetTotalMs(preset), [preset]);

  const [status, setStatus] = useState<TimerStatus>('idle');
  const [elapsed, setElapsed] = useState(0);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const anchorRef = useRef({ at: 0, base: 0 });
  const prevRef = useRef(0);
  const doneRef = useRef(false);

  const locate = useCallback(
    (ms: number): Location => {
      if (segments.length === 0) return { index: 0, offset: 0 };
      let acc = 0;
      for (let i = 0; i < segments.length; i += 1) {
        const duration = segments[i].durationMs;
        if (ms < acc + duration) return { index: i, offset: ms - acc };
        acc += duration;
      }
      const last = segments.length - 1;
      return { index: last, offset: segments[last]?.durationMs ?? 0 };
    },
    [segments]
  );

  const complete = useCallback(
    (info: CompleteInfo) => {
      if (doneRef.current) return;
      doneRef.current = true;
      const finalMs = info.completed ? totalMs : info.elapsedMs;
      prevRef.current = finalMs;
      setElapsed(finalMs);
      setStatus('finished');
      playFinish(settingsRef.current);
      onCompleteRef.current(info);
    },
    [totalMs]
  );

  // Reset whenever the identity/shape of the active preset changes.
  const presetKey = `${preset.id}|${preset.workSec}|${preset.restSec}|${preset.rounds}`;
  useEffect(() => {
    setStatus('idle');
    setElapsed(0);
    prevRef.current = 0;
    doneRef.current = false;
  }, [presetKey]);

  // Main loop — only alive while the timer runs.
  useEffect(() => {
    if (status !== 'running') return;

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const ms = Math.min(anchorRef.current.base + (now - anchorRef.current.at), totalMs);
      const prev = prevRef.current;

      if (ms > prev) {
        const from = locate(prev);
        const to = locate(ms);
        if (from.index === to.index) {
          // Same segment: fire countdown beeps crossing 3/2/1 seconds.
          const duration = segments[from.index].durationMs;
          const before = duration - from.offset;
          const after = duration - to.offset;
          const secBefore = Math.ceil(before / 1000);
          const secAfter = Math.ceil(after / 1000);
          if (after > 0 && secAfter < secBefore && secAfter <= 3) {
            playCountdown(settingsRef.current);
          }
        } else {
          // Crossed a segment boundary: work ⇄ rest.
          playPhaseChange(settingsRef.current);
        }
      }

      prevRef.current = ms;
      setElapsed(ms);

      if (ms >= totalMs) {
        complete({ completed: true, elapsedMs: totalMs });
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, totalMs, segments, locate, complete]);

  const start = useCallback(() => {
    if (status === 'running') return;
    let base = elapsed;
    if (status === 'finished' || base >= totalMs) {
      base = 0;
      doneRef.current = false;
      setElapsed(0);
    }
    anchorRef.current = { at: performance.now(), base };
    prevRef.current = base;
    setStatus('running');
  }, [status, elapsed, totalMs]);

  const pause = useCallback(() => {
    if (status !== 'running') return;
    setStatus('paused');
  }, [status]);

  const toggle = useCallback(() => {
    if (status === 'running') pause();
    else start();
  }, [status, pause, start]);

  const reset = useCallback(() => {
    setStatus('idle');
    setElapsed(0);
    prevRef.current = 0;
    doneRef.current = false;
  }, []);

  const skip = useCallback(() => {
    if (status !== 'running' && status !== 'paused') return;
    const here = locate(elapsed);
    let boundary = 0;
    for (let i = 0; i <= here.index; i += 1) boundary += segments[i].durationMs;

    if (boundary >= totalMs) {
      complete({ completed: true, elapsedMs: totalMs });
      return;
    }
    prevRef.current = boundary;
    setElapsed(boundary);
    anchorRef.current = { at: performance.now(), base: boundary };
    playPhaseChange(settingsRef.current);
  }, [status, elapsed, locate, segments, totalMs, complete]);

  const finish = useCallback(() => {
    if (status !== 'running' && status !== 'paused') return;
    complete({ completed: false, elapsedMs: elapsed });
  }, [status, elapsed, complete]);

  // Derived view of the current position.
  const location = locate(Math.min(elapsed, totalMs));
  const segment = segments[location.index] ?? FALLBACK_SEGMENT;
  const segmentRemainingMs = Math.max(0, segment.durationMs - location.offset);
  const segmentProgress = segment.durationMs > 0 ? location.offset / segment.durationMs : 0;
  const totalProgress = totalMs > 0 ? elapsed / totalMs : 0;

  return {
    status,
    elapsed,
    totalMs,
    segments,
    segment,
    segmentIndex: location.index,
    segmentRemainingMs,
    segmentProgress,
    totalProgress,
    totalRemainingMs: Math.max(0, totalMs - elapsed),
    round: segment.round,
    rounds: preset.rounds,
    start,
    pause,
    toggle,
    reset,
    skip,
    finish,
  };
}

export type TimerApi = ReturnType<typeof useIntervalTimer>;
