/** 372000 → "6:12", 45000 → "0:45", 3600000 → "60:00" */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Compact duration for history/stats: "1h 05m", "12m 30s", "45s" */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(rest).padStart(2, '0')}s`;
  return `${rest}s`;
}

/**
 * Stopwatch with tenths: "0:07.4", "12:03.9"; past an hour the tenths drop
 * and hours appear: "1:02:05". Floor, not round — a stopwatch never lies
 * forward.
 */
export function formatStopwatch(ms: number): string {
  const tenthsTotal = Math.max(0, Math.floor(ms / 100));
  const tenths = tenthsTotal % 10;
  const secondsTotal = Math.floor(tenthsTotal / 10);
  const seconds = secondsTotal % 60;
  const minutesTotal = Math.floor(secondsTotal / 60);
  const minutes = minutesTotal % 60;
  const hours = Math.floor(minutesTotal / 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutesTotal}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

/** "29 Sep 2026, 7:03 PM" (device locale) */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Local id — crypto.randomUUID needs a secure context, this works everywhere. */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
