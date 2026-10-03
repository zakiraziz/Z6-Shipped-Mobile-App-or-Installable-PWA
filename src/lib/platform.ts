/**
 * Small capability probes, so the UI can show an honest fallback instead of
 * silently doing nothing when a platform API is missing.
 */

/** Wake Lock (screen-on) — Chrome/Edge yes, older Safari no. */
export function hasWakeLock(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/** Save-Data hint (Chrome/Android) — used to skip work that buys nothing. */
export function isSaveDataEnabled(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return nav.connection?.saveData === true;
}

/** Vibration API — Android yes, iOS Safari no. */
export function hasVibration(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Speech synthesis — used by the Voice cues preference. */
export function hasSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}