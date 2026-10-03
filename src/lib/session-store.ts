/**
 * #1 Resume-after-kill: the in-flight session, persisted so a force-quit, an
 * OS tab eviction or a crash doesn't silently lose the workout.
 *
 * We store the full preset shape (not just its id) so a custom preset deleted
 * afterwards can still be restored, and the elapsed position at the last write.
 * Resume is deliberately FROZEN at the saved position — predictable, and it
 * avoids the "you came back three hours later and the session instantly
 * completed" surprise that wall-clock resume would produce.
 */
export type StoredSession = {
  presetId: string;
  presetName: string;
  workSec: number;
  restSec: number;
  rounds: number;
  elapsedMs: number;
  savedAt: string;
};

const KEY = 'beep.session.v1';
/** Older than this and it's a different workout — don't offer it. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Below this it isn't worth a prompt. */
const MIN_ELAPSED_MS = 1000;

export function writeSession(session: Omit<StoredSession, 'savedAt'>): void {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...session, savedAt: new Date().toISOString() })
    );
  } catch {
    /* storage full/blocked — the running timer is unaffected */
  }
}

export function readSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredSession>;
    const elapsedMs = Number(data.elapsedMs);
    if (
      typeof data.presetId !== 'string' ||
      typeof data.presetName !== 'string' ||
      typeof data.workSec !== 'number' ||
      typeof data.restSec !== 'number' ||
      typeof data.rounds !== 'number' ||
      !Number.isFinite(elapsedMs) ||
      elapsedMs < MIN_ELAPSED_MS
    ) {
      return null;
    }
    const age = Date.now() - new Date(String(data.savedAt)).getTime();
    if (!Number.isFinite(age) || age > MAX_AGE_MS) return null;
    return {
      presetId: data.presetId,
      presetName: data.presetName,
      workSec: data.workSec,
      restSec: data.restSec,
      rounds: data.rounds,
      elapsedMs,
      savedAt: String(data.savedAt),
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}