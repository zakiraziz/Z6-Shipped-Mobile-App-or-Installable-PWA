import { isSaveDataEnabled } from './platform';
import type { SoundTheme } from '../types';

/**
 * All cues are synthesised with the Web Audio API — no audio files, so every
 * beep works offline. The AudioContext is created/unlocked on the first user
 * gesture (primeAudio from the Start button) as browsers block audio before.
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
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Unlock audio from inside the first user gesture (Start tap). The zero-length
 * buffer "blip" marks the context as user-activated — iOS requires this before
 * it will let the page make sound later (e.g. after backgrounding).
 *
 * #15 note: taken literally, "skip priming when Save-Data is on" would disable
 * iOS audio entirely (the blip *is* the unlock), and the buffer is one sample
 * with zero network cost. So the safe subset is implemented: with Save-Data on
 * we skip the whole audio stack only when the user has sound switched OFF,
 * which is the one case priming buys nothing at all.
 */
export function primeAudio(soundEnabled = true): void {
  if (!soundEnabled && isSaveDataEnabled()) return;
  const ac = audio();
  if (!ac) return;
  try {
    const source = ac.createBufferSource();
    source.buffer = ac.createBuffer(1, 1, ac.sampleRate);
    source.connect(ac.destination);
    source.start();
  } catch {
    /* ignore */
  }
}

/**
 * iOS suspends the AudioContext when the tab is backgrounded — call this on
 * visibilitychange/return so the next cue can actually make sound.
 */
export function resumeAudio(): void {
  const ac = audio();
  if (ac && ac.state === 'suspended') void ac.resume().catch(() => undefined);
}

/**
 * Audio half of the cue system — vibration patterns and notifications live in
 * lib/cues.ts so each channel can be tuned independently.
 * Every play* takes the user's 0–1 volume; gain is capped so a square wave at
 * full volume stays listenable rather than painful.
 */
const MAX_GAIN = 0.3;

/**
 * Cue themes: one waveform + envelope per theme, applied to the SAME note
 * sequences — so "chime" is a soft sine with a long tail, "click" a sharp
 * 35%-length tick, and "beep" the original square wave. Pure Web Audio, still
 * zero audio files, so every cue keeps working offline.
 */
type Voice = { wave: OscillatorType; length: number; attack: number; gain: number };

const VOICES: Record<SoundTheme, Voice> = {
  beep: { wave: 'square', length: 1, attack: 0.01, gain: 1 },
  chime: { wave: 'sine', length: 1.6, attack: 0.02, gain: 1.5 },
  click: { wave: 'triangle', length: 0.35, attack: 0.002, gain: 1.2 },
};

function tone(
  frequency: number,
  durationMs: number,
  delayMs = 0,
  volume = 0.12,
  theme: SoundTheme = 'beep'
): void {
  const ac = audio();
  if (!ac) return;
  const voice = VOICES[theme] ?? VOICES.beep;
  const start = ac.currentTime + delayMs / 1000;
  const end = start + (durationMs * voice.length) / 1000;
  // Never ramp toward 0 (exponential ramps reject it) and never clip.
  const peak = Math.min(0.6, Math.max(0.0001, volume * voice.gain));

  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = voice.wave;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + voice.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(ac.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

export function playCountdown(volume = 0.5, theme: SoundTheme = 'beep'): void {
  tone(880, 90, 0, MAX_GAIN * volume, theme);
}

export function playPhaseChange(volume = 0.5, theme: SoundTheme = 'beep'): void {
  tone(660, 110, 0, MAX_GAIN * volume, theme);
  tone(990, 160, 140, MAX_GAIN * volume, theme);
}

export function playFinish(volume = 0.5, theme: SoundTheme = 'beep'): void {
  tone(660, 140, 0, MAX_GAIN * volume, theme);
  tone(880, 140, 170, MAX_GAIN * volume, theme);
  tone(1180, 300, 340, MAX_GAIN * volume, theme);
}

/** Distinct two-note chirp for the optional halfway cue. */
export function playHalfway(volume = 0.5, theme: SoundTheme = 'beep'): void {
  tone(1200, 80, 0, MAX_GAIN * volume, theme);
  tone(1600, 100, 95, MAX_GAIN * volume, theme);
}

