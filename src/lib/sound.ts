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
 */
export function primeAudio(): void {
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

/**
 * Audio half of the cue system — vibration patterns and notifications live in
 * lib/cues.ts so each channel can be tuned independently.
 */
export function playCountdown(): void {
  tone(880, 90);
}

export function playPhaseChange(): void {
  tone(660, 110);
  tone(990, 160, 140);
}

export function playFinish(): void {
  tone(660, 140);
  tone(880, 140, 170);
  tone(1180, 300, 340);
}

