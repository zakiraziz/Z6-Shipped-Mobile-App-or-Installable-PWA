import type { Segment, Settings } from '../types';
import { formatClock } from './format';
import { clearCueNotifications, showCueNotification } from './notify';
import { playCountdown, playFinish, playHalfway, playPhaseChange } from './sound';

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
  /**
   * Force the notification even though the screen is now visible. Set when a
   * gap (throttle/sleep) proved the user was NOT watching those phases — e.g.
   * unlocking straight into the app. The ring shows the truth, but the cues
   * for those boundaries were physically missed.
   */
  forceNotify?: boolean;
};

/**
 * Segment changed (work ⇄ rest). When the app is in front, ring + sound +
 * haptics already carry the cue; when the screen is not visible we escalate
 * to a persistent notification so a phone in a pocket still alerts.
 * ONE dispatch per boundary — the haptic pattern comes from the next segment
 * only, so work ⇄ rest can never double-fire into a 4-beat.
 */
export function cuePhaseChange(settings: Settings, phase: PhaseCue): void {
  if (settings.sound) playPhaseChange();
  if (settings.vibrate) buzz(PULSE[phase.next.kind]);
  if (!screenHidden() && !phase.forceNotify) return;

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
