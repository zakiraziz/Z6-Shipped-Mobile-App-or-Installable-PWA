import { useState } from 'react';
import { Flame, Timer, Trash2 } from 'lucide-react';
import { formatDateTime, formatDuration } from '../lib/format';
import { useAppState } from '../state';

const statCard =
  'flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-center';

export function HistoryScreen() {
  const { history, clearHistory } = useAppState();
  const [armed, setArmed] = useState(false);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sessionsThisWeek = history.filter(
    (entry) => new Date(entry.finishedAt).getTime() >= weekAgo
  ).length;
  const totalSeconds = history.reduce((sum, entry) => sum + entry.elapsedSeconds, 0);

  // #19: consecutive local days with ≥1 session (today, or starting yesterday).
  const trainedDays = new Set(history.map((entry) => new Date(entry.finishedAt).toDateString()));
  const streakCursor = new Date();
  if (!trainedDays.has(streakCursor.toDateString())) {
    streakCursor.setDate(streakCursor.getDate() - 1);
  }
  let streak = 0;
  while (trainedDays.has(streakCursor.toDateString())) {
    streak += 1;
    streakCursor.setDate(streakCursor.getDate() - 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">History</h2>
          <p className="text-xs text-slate-400">Saved on this device · readable offline</p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => {
              if (armed) {
                clearHistory();
                setArmed(false);
              } else {
                setArmed(true);
              }
            }}
            onBlur={() => setArmed(false)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition ${
              armed
                ? 'border-rose-400 bg-rose-400/10 text-rose-300'
                : 'border-slate-700 text-slate-400'
            }`}
          >
            <Trash2 size={13} /> {armed ? 'Tap again to clear' : 'Clear'}
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center">
          <Timer size={28} className="mx-auto text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-300">No sessions yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
            Run a timer — every finished session is stored on this device and appears here,
            even with no connection.
          </p>
        </div>
      ) : (
        <>
          {streak >= 1 && (
            <div className="flex items-center gap-2 rounded-2xl border border-orange-400/30 bg-orange-400/5 px-4 py-3">
              <Flame size={16} className="shrink-0 text-orange-400" />
              <p className="text-sm text-orange-200/90">
                <span className="font-bold">{streak}-day streak</span>
                {streak === 1 ? ' — trained today, nice start' : ' in a row — keep it going'}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <div className={statCard}>
              <p className="text-xl font-bold tabular-nums">{history.length}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                Sessions
              </p>
            </div>
            <div className={statCard}>
              <p className="text-xl font-bold tabular-nums">{sessionsThisWeek}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                This week
              </p>
            </div>
            <div className={statCard}>
              <p className="text-xl font-bold tabular-nums">{formatDuration(totalSeconds)}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                Total time
              </p>
            </div>
          </div>

          <ul className="space-y-2.5">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.presetName}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(entry.finishedAt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatDuration(entry.elapsedSeconds)}
                  </p>
                  <p
                    className={`text-xs ${entry.completed ? 'text-emerald-400' : 'text-amber-400'}`}
                  >
                    {entry.completed ? 'completed' : 'partial'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
