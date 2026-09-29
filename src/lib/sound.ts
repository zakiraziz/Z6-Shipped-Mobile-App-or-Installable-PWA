import type { Settings } from '../types';

/**
 * All cues are synthesised with the Web Audio API — no audio files, so every
 * beep works offline. The AudioContext is created on the first user gesture
 * (primeAudio from the Start button) as browsers block audio before that.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a click/tap so audio is allowed to start later. */
export function primeAudio(): void {
  audio();
}

function tone(frequency: number, durationMs: number, delayMs = 0, volume = 0.12): void {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + delayMs / 1000;
  const end = start + durationMs / 1000;

  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(ac.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration not supported (iOS, desktop) — ignore */
  }
}

/** Last 3 seconds of a segment. */
export function playCountdown(settings: Settings): void {
  if (settings.sound) tone(880, 90);
  if (settings.vibrate) buzz(45);
}

/** Segment changed: work ⇄ rest. */
export function playPhaseChange(settings: Settings): void {
  if (settings.sound) {
    tone(660, 110);
    tone(990, 160, 140);
  }
  if (settings.vibrate) buzz([80, 60, 80]);
}

/** Session finished. */
export function playFinish(settings: Settings): void {
  if (settings.sound) {
    tone(660, 140);
    tone(880, 140, 170);
    tone(1180, 300, 340);
  }
  if (settings.vibrate) buzz([200, 90, 200, 90, 400]);
}
