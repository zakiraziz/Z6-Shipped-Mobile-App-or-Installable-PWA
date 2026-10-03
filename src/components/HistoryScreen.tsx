import { useMemo, useState } from 'react';
import { ArrowDownUp, Download, Flame, Play, Timer, Trash2 } from 'lucide-react';
import { formatDateTime, formatDuration, uid } from '../lib/format';
import { serializeHistory } from '../lib/history-io';
import type { HistoryEntry, Preset } from '../types';
import type { TabId } from './TabBar';
import { useAppState } from '../state';

const statCard =
  'flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-center';
const controlButton =
  'flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-slate-200 active:scale-95';

type Props = {
  /** #7 "Run again" jumps back to the timer with the preset selected */
  onNavigate?: (tab: TabId) => void;
};

export function HistoryScreen({ onNavigate }: Props) {
  const { history, clearHistory, presets, savePreset, selectPreset } = useAppState();
  const [armed, setArmed] = useState(false);
  /** #8 filter + sort once the list outgrows "newest first" */
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'newest' | 'longest'>('newest');
  const [exportStatus, setExportStatus] = useState('');

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const entriesThisWeek = history.filter(
    (entry) => new Date(entry.finishedAt).getTime() >= weekAgo
  );
  const sessionsThisWeek = entriesThisWeek.length;
  /** #16 weekly time total — habit signal without streak brittleness */
  const weekSeconds = entriesThisWeek.reduce((sum, entry) => sum + entry.elapsedSeconds, 0);
  const totalSeconds = history.reduce((sum, entry) => sum + entry.elapsedSeconds, 0);

  // Streak: consecutive local days with ≥1 session (today, or starting yesterday).
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

  const presetNames = useMemo(
    () => [...new Set(history.map((entry) => entry.presetName))],
    [history]
  );

  const visible = useMemo(() => {
    const rows = filter === 'all' ? history : history.filter((e) => e.presetName === filter);
    if (sort === 'newest') return rows;
    return [...rows].sort((a, b) => b.elapsedSeconds - a.elapsedSeconds);
  }, [history, filter, sort]);

  /** #19 export completes the export/import symmetry (presets already have it). */
  const handleExport = () => {
    const blob = new Blob([serializeHistory(history)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `beep-history-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportStatus('Exported');
    window.setTimeout(() => setExportStatus(''), 2500);
  };

  /** #7/#17 re-run a past session — reuse a matching preset or recreate it. */
  const runAgain = (entry: HistoryEntry) => {
    if (entry.workSec == null || entry.restSec == null) return; // pre-Round-3 entries
    const match = presets.find(
      (p) =>
        p.name === entry.presetName &&
        p.workSec === entry.workSec &&
        p.restSec === entry.restSec &&
        p.rounds === entry.rounds
    );
    if (match) {
      selectPreset(match.id);
      onNavigate?.('timer');
      return;
    }
    const fresh: Preset = {
      id: uid(),
      name: entry.presetName,
      workSec: entry.workSec,
      restSec: entry.restSec,
      rounds: entry.rounds,
      builtin: false,
    };
    savePreset(fresh);
    selectPreset(fresh.id);
    onNavigate?.('timer');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">History</h2>
          <p className="text-xs text-slate-400">Saved on this device · readable offline</p>
        </div>
        {history.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={handleExport} className={controlButton}>
              <Download size={13} /> {exportStatus || 'Export'}
            </button>
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
              className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition ${
                armed
                  ? 'border-rose-400 bg-rose-400/10 text-rose-300'
                  : 'border-slate-700 text-slate-400'
              }`}
            >
              <Trash2 size={13} /> {armed ? 'Tap again to clear' : 'Clear'}
            </button>
          </div>
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

          {/* #16: this week in words + minutes — steadier than a streak */}
          <p className="text-xs text-slate-500">
            This week: {sessionsThisWeek} session{sessionsThisWeek === 1 ? '' : 's'} ·{' '}
            {formatDuration(weekSeconds)}
          </p>

          {/* #8: filter + sort */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter history by preset"
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 outline-none focus:border-lime-400"
            >
              <option value="all">All presets</option>
              {presetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSort((current) => (current === 'newest' ? 'longest' : 'newest'))}
              className={controlButton}
              aria-label={
                sort === 'newest' ? 'Sorted newest first — switch to longest' : 'Sorted longest first — switch to newest'
              }
            >
              <ArrowDownUp size={13} /> {sort === 'newest' ? 'Newest' : 'Longest'}
            </button>
          </div>

          <ul className="space-y-2.5">
            {visible.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {entry.label ? `${entry.label} · ` : ''}
                    {entry.presetName}
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(entry.finishedAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatDuration(entry.elapsedSeconds)}
                    </p>
                    <p
                      className={`text-xs ${entry.completed ? 'text-emerald-400' : 'text-amber-400'}`}
                    >
                      {entry.completed ? 'completed' : 'partial'}
                    </p>
                  </div>
                  {entry.workSec != null && entry.restSec != null && (
                    <button
                      onClick={() => runAgain(entry)}
                      aria-label={`Run ${entry.presetName} again`}
                      title="Run again"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-lime-400/60 hover:text-lime-300 active:scale-95"
                    >
                      <Play size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
