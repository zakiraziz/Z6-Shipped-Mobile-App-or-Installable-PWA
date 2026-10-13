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

/**
 * RFC 4180 quoting — a label with a comma, quote or newline must not break
 * the row (a silently mis-parsed spreadsheet is worse than no export).
 */
function csvCell(value: string | number | boolean | undefined): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV export — one spreadsheet-ready row per session, newest first. */
export function serializeHistoryCsv(entries: HistoryEntry[]): string {
  const header =
    'date,preset,label,planned_seconds,elapsed_seconds,rounds,completed,work_seconds,rest_seconds';
  const rows = entries.map((entry) =>
    [
      entry.finishedAt,
      entry.presetName,
      entry.label ?? '',
      entry.plannedSeconds,
      entry.elapsedSeconds,
      entry.rounds,
      entry.completed,
      entry.workSec ?? '',
      entry.restSec ?? '',
    ]
      .map(csvCell)
      .join(',')
  );
  return [header, ...rows].join('\r\n');
}