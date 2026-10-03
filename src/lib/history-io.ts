import type { HistoryEntry } from '../types';

/** #19 — same envelope style as the preset export, for symmetry. */
export function serializeHistory(entries: HistoryEntry[]): string {
  return JSON.stringify(
    {
      app: 'beep',
      kind: 'history',
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: entries,
    },
    null,
    2
  );
}