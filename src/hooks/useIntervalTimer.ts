import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cueCountdown, cueFinish, cuePhaseChange } from '../lib/cues';
import { resumeAudio } from '../lib/sound';
import { buildSegments, presetTotalMs } from '../lib/presets';
import type { Preset, Settings, TimerStatus } from '../types';
import type { Segment } from '../types';

export type CompleteInfo = { completed: boolean; elapsedMs: number };

type Location = { index: number; offset: number };

/** Guard so a corrupted preset can never crash the render. */
const FALLBACK_SEGMENT: Segment = { kind: 'work', label: 'Work', round: 1, durationMs: 0 };

/**
 * Main-loop cadence. A plain interval (not rAF) keeps firing while the tab is
 * backgrounded, and every tick replays ALL boundaries crossed since the last
 * one — so a throttled or slept phone catches up instead of missing cues.
 * Additionally each tick arms a precise setTimeout at the next boundary, so a
 * wake lands exactly on the phase change even if the interval chain throttles.
 */
const TICK_MS = 200;
/** Gap after which crossed phases count as "the user wasn't watching". */
const CATCHUP_GAP_MS = 5000;

/**
 * The timer engine. Elapsed time is derived from timestamps
 * (`anchor.base + performance.now() - anchor.at`) instead of counting ticks,
 * so a throttled background tab catches up exactly when it is visible again.
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
  const presetNameRef = useRef(preset.name);
  presetNameRef.current = preset.name;

  const anchorRef = useRef({ at: 0, base: 0 });
  const prevRef = useRef(0);
  const lastTickAtRef = useRef(0);
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
      cueFinish(settingsRef.current, {
        presetName: presetNameRef.current,
        elapsedMs: finalMs,
        completed: info.completed,
      });
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

  // Main loop — a plain interval, NOT rAF: it keeps firing in a backgrounded
  // tab (rAF stops entirely). Each tick replays EVERY segment boundary crossed
  // since the previous tick, so a throttled or slept phone catches up on missed
  // cues instead of silently skipping them.
  useEffect(() => {
    if (status !== 'running') return;

    let boundaryTimeout = 0;

    /** Precise wake at the next segment boundary (see TICK_MS note above). */
    const armBoundaryWake = (fromMs: number) => {
      let acc = 0;
      let next = totalMs;
      for (let i = 0; i < segments.length - 1; i += 1) {
        acc += segments[i].durationMs;
        if (acc > fromMs) {
          next = acc;
          break;
        }
      }
      window.clearTimeout(boundaryTimeout);
      boundaryTimeout = window.setTimeout(tick, Math.max(1, next - fromMs));
    };

    const tick = () => {
      const now = performance.now();
      const gap = lastTickAtRef.current === 0 ? 0 : now - lastTickAtRef.current;
      lastTickAtRef.current = now;
      const ms = Math.min(anchorRef.current.base + (now - anchorRef.current.at), totalMs);
      const prev = prevRef.current;

      if (ms > prev && segments.length > 0) {
        // Boundaries strictly between prev and ms (prev < b <= ms). Values are
        // indices of the segments that START at each crossed boundary.
        const crossed: number[] = [];
        let acc = 0;
        for (let i = 0; i < segments.length - 1; i += 1) {
          acc += segments[i].durationMs;
          if (acc > prev && acc <= ms) crossed.push(i + 1);
        }

        if (crossed.length > 0) {
          // Coalesce: one cue for the latest boundary (tag+renotify replaces
          // any earlier notification — no spam after a long sleep). A large
          // tick gap means the crossings happened while throttled/suspended:
          // force the notification even if we're visible again, because the
          // user demonstrably missed those cues.
          const lastIndex = crossed[crossed.length - 1];
          cuePhaseChange(settingsRef.current, {
            endedKind: segments[lastIndex - 1].kind,
            next: segments[lastIndex],
            rounds: preset.rounds,
            missed: crossed.length,
            forceNotify: gap > CATCHUP_GAP_MS,
          });
        } else {
          // Same segment: fire countdown beeps when crossing 3/2/1 seconds.
          const from = locate(prev);
          const to = locate(ms);
          const duration = segments[from.index].durationMs;
          const before = duration - from.offset;
          const after = duration - to.offset;
          const secBefore = Math.ceil(before / 1000);
          const secAfter = Math.ceil(after / 1000);
          if (after > 0 && secAfter < secBefore && secAfter <= 3) {
            cueCountdown(settingsRef.current);
          }
        }
      }

      prevRef.current = ms;
      setElapsed(ms);

      if (ms >= totalMs) {
        complete({ completed: true, elapsedMs: totalMs });
        return;
      }
      armBoundaryWake(ms);
    };

    tick(); // immediate first frame so Start feels instant
    const intervalId = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(boundaryTimeout);
    };
  }, [status, totalMs, segments, locate, complete, preset.rounds]);

  const start = useCallback(() => {
    if (status === 'running') return;
    resumeAudio(); // Start is always a gesture — belt & braces for iOS
    let base = elapsed;
    if (status === 'finished' || base >= totalMs) {
      base = 0;
      doneRef.current = false;
      setElapsed(0);
    }
    anchorRef.current = { at: performance.now(), base };
    prevRef.current = base;
    lastTickAtRef.current = performance.now();
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
    cuePhaseChange(settingsRef.current, {
      endedKind: segments[here.index].kind,
      next: segments[here.index + 1],
      rounds: preset.rounds,
    });
  }, [status, elapsed, locate, segments, totalMs, complete, preset.rounds]);

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
