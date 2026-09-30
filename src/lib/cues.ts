import type { Segment, Settings } from '../types';
import { formatClock } from './format';
import { clearCueNotifications, showCueNotification } from './notify';
import { playCountdown, playFinish, playPhaseChange } from './sound';

/** Distinct haptics per phase: work = 3 short pulses, rest = 1 long pulse. */
const PULSE: Record<Segment['kind'], number[]> = {
  work: [60, 45, 60, 45, 60],
  rest: [320],
};
const COUNTDOWN_PATTERN = [45];
const FINISH_PATTERN = [200, 90, 200, 90, 400];

function buzz(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS/desktop: ignore */
  }
}

/** Only notify when the user is NOT already looking at the ring. */
function screenHidden(): boolean {
  return document.visibilityState !== 'visible';
}

/** Last 3 seconds of a segment. */
export function cueCountdown(settings: Settings): void {
  if (settings.sound) playCountdown();
  if (settings.vibrate) buzz(COUNTDOWN_PATTERN);
}

export type PhaseCue = {
  /** the segment that just ended — used for the "Work complete" title */
  endedKind: Segment['kind'];
  next: Segment;
  rounds: number;
  /** boundaries crossed in this tick — >1 means we caught up after throttling */
  missed?: number;
};

/**
 * Segment changed (work ⇄ rest). When the app is in front, ring + sound +
 * haptics already carry the cue; when the screen is not visible we escalate
 * to a persistent notification so a phone in a pocket still alerts.
 */
export function cuePhaseChange(settings: Settings, phase: PhaseCue): void {
  if (settings.sound) playPhaseChange();
  if (settings.vibrate) buzz(PULSE[phase.next.kind]);
  if (!screenHidden()) return;

  const missed = (phase.missed ?? 1) > 1 ? ` · ${phase.missed} phases passed` : '';
  void showCueNotification({
    title: `${phase.endedKind === 'work' ? 'Work' : 'Rest'} complete`,
    body: `${phase.next.label} ${formatClock(phase.next.durationMs)} — round ${phase.next.round}/${phase.rounds}${missed}`,
    vibrate: settings.vibrate ? [...PULSE[phase.next.kind]] : undefined,
  });
}

export type FinishCue = { presetName: string; elapsedMs: number; completed: boolean };

/** Session ended: fanfare in front of the user, requireInteraction when not. */
export function cueFinish(settings: Settings, finish: FinishCue): void {
  if (settings.sound) playFinish();
  if (settings.vibrate) buzz(FINISH_PATTERN);

  if (!screenHidden()) {
    clearCueNotifications();
    return;
  }
  void showCueNotification({
    title: 'Session complete',
    body: `${finish.presetName} — ${formatClock(finish.elapsedMs)}${
      finish.completed ? '' : ' (partial)'
    } · saved to history`,
    vibrate: settings.vibrate ? [...FINISH_PATTERN] : undefined,
  });
}
