import { useMemo, useState } from 'react';
import { ArrowDownUp, Download, FileText, Flame, Play, Search, Timer, Trash2 } from 'lucide-react';
import { formatDateTime, formatDuration, uid } from '../lib/format';
import { serializeHistory, serializeHistoryCsv } from '../lib/history-io';
import type { HistoryEntry, Preset } from '../types';
import type { TabId } from './TabBar';
import { useAppState } from '../state';
import { useToast } from './Toast';

const statCard =
  'flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-center';
const controlButton =
  'flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-slate-200 active:scale-95';

type Props = {
  /** #7 "Run again" jumps back to the timer with the preset selected */
  onNavigate?: (tab: TabId) => void;
};

export function HistoryScreen({ onNavigate }: Props) {
  const {
    history,
    clearHistory,
    restoreHistory,
    presets,
    savePreset,
    selectPreset,
    settings,
    updateSetting,
  } = useAppState();
  const toast = useToast();
  const [armed, setArmed] = useState(false);
  /** #8 filter + sort once the list outgrows "newest first" */
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'longest'>('newest');
  const [exportStatus, setExportStatus] = useState('');
  const [csvStatus, setCsvStatus] = useState('');

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

  /** Best-ever streak over the whole history — consecutive local days. */
  const trainedDayStarts = [...trainedDays]
    .map((day) => new Date(day).setHours(0, 0, 0, 0))
    .sort((a, b) => a - b);
  let bestStreak = 0;
  let dayRun = 0;
  let previousDay: number | null = null;
  for (const start of trainedDayStarts) {
    dayRun =
      previousDay !== null && Math.round((start - previousDay) / 86400000) === 1 ? dayRun + 1 : 1;
    previousDay = start;
    bestStreak = Math.max(bestStreak, dayRun);
  }

  const avgSeconds = history.length > 0 ? Math.round(totalSeconds / history.length) : 0;
  const completedCount = history.filter((entry) => entry.completed).length;

  /** Rolling last 7 local days (oldest → today), measured against the goal. */
  const DAY_MS = 86400000;
  const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const last7 = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(todayStart.getTime() - (6 - index) * DAY_MS);
    const key = start.toDateString();
    const seconds = history
      .filter((entry) => new Date(entry.finishedAt).toDateString() === key)
      .reduce((sum, entry) => sum + entry.elapsedSeconds, 0);
    return {
      key,
      letter: DAY_LETTERS[start.getDay()],
      minutes: Math.round(seconds / 60),
      isToday: index === 6,
    };
  });
  const goal = settings.dailyGoalMinutes;
  const goalOn = goal > 0;
  const goalMet = goalOn && last7[6].minutes >= goal;
  const peakMinutes = Math.max(goal, ...last7.map((day) => day.minutes), 1);

  const stepGoal = (delta: number) =>
    updateSetting('dailyGoalMinutes', Math.min(120, Math.max(0, goal + delta)));

  const presetNames = useMemo(
    () => [...new Set(history.map((entry) => entry.presetName))],
    [history]
  );

  const visible = useMemo(() => {
    const rows = filter === 'all' ? history : history.filter((e) => e.presetName === filter);
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? rows.filter((e) => `${e.presetName} ${e.label ?? ''}`.toLowerCase().includes(needle))
      : rows;
    if (sort === 'newest') return matched;
    return [...matched].sort((a, b) => b.elapsedSeconds - a.elapsedSeconds);
  }, [history, filter, query, sort]);

  const needle = query.trim();

  /**
   * Two deliberate taps (the second one armed), and even then the clear is
   * reversible — a mistake costs one Undo, not a lost year of history.
   */
  const handleClear = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    const snapshot = history;
    clearHistory();
    setArmed(false);
    setQuery('');
    setFilter('all');
    toast.show(
      `Cleared ${snapshot.length} session${snapshot.length === 1 ? '' : 's'} from this device`,
      { action: { label: 'Undo', onClick: () => restoreHistory(snapshot) } }
    );
  };

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

  /** CSV twin of the JSON export — same data, opens in any spreadsheet. */
  const handleCsvExport = () => {
    const blob = new Blob([serializeHistoryCsv(history)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `beep-history-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCsvStatus('Saved');
    window.setTimeout(() => setCsvStatus(''), 2500);
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
            <button
              onClick={handleCsvExport}
              aria-label="Export history as CSV"
              className={controlButton}
            >
              <FileText size={13} /> {csvStatus || 'CSV'}
            </button>
            <button onClick={handleExport} className={controlButton}>
              <Download size={13} /> {exportStatus || 'Export'}
            </button>
            <button
              onClick={handleClear}
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
          <div className="flex gap-3">
            <div className={statCard}>
              <p className="text-xl font-bold tabular-nums">{formatDuration(avgSeconds)}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                Avg session
              </p>
            </div>
            <div className={statCard}>
              <p className="text-xl font-bold tabular-nums">{bestStreak}d</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                Best streak
              </p>
            </div>
            <div className={statCard}>
              <p className="text-xl font-bold tabular-nums">
                {completedCount}/{history.length}
              </p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                Completed
              </p>
            </div>
          </div>

          {/* #16: this week in words + minutes — steadier than a streak */}
          <p className="text-xs text-slate-500">
            This week: {sessionsThisWeek} session{sessionsThisWeek === 1 ? '' : 's'} ·{' '}
            {formatDuration(weekSeconds)}
          </p>

          {/* daily goal + a 7-day strip — the habit signal in one glance */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">Daily goal</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => stepGoal(-5)}
                  aria-label="Decrease daily goal"
                  disabled={!goalOn}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition active:scale-95 disabled:opacity-30"
                >
                  −
                </button>
                <span className="min-w-[64px] text-center text-sm font-semibold tabular-nums">
                  {goalOn ? `${goal} min` : 'Off'}
                </span>
                <button
                  onClick={() => stepGoal(5)}
                  aria-label="Increase daily goal"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition active:scale-95"
                >
                  +
                </button>
              </div>
            </div>
            {goalOn && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Today{goalMet ? ' · goal met ✓' : ''}</span>
                  <span className="tabular-nums">
                    {last7[6].minutes} / {goal} min
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      goalMet ? 'bg-lime-400' : 'bg-lime-400/50'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((last7[6].minutes / goal) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div
              role="img"
              aria-label={`Activity last 7 days: ${last7
                .map((day) => `${day.letter} ${day.minutes} min`)
                .join(', ')}`}
              className="mt-3 flex h-16 items-end justify-between gap-1.5"
            >
              {last7.map((day) => (
                <div
                  key={day.key}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                >
                  <div
                    aria-hidden="true"
                    className={`w-full rounded-t transition-all ${
                      goalOn && day.minutes >= goal
                        ? 'bg-lime-400'
                        : day.isToday
                          ? 'bg-sky-400/70'
                          : 'bg-slate-700'
                    }`}
                    style={{
                      height: `${Math.max(4, Math.round((day.minutes / peakMinutes) * 100))}%`,
                    }}
                  />
                  <span
                    className={`text-[10px] ${day.isToday ? 'text-slate-300' : 'text-slate-500'}`}
                  >
                    {day.letter}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* free-text search — preset names and session labels */}
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search history"
              placeholder="Search preset or label…"
              className="w-full rounded-full border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-slate-200 outline-none transition focus:border-lime-400 placeholder:text-slate-500"
            />
          </div>

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

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center">
              <Search size={24} className="mx-auto text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-300">
                {needle ? `No sessions match “${needle}”` : 'No sessions match these filters'}
              </p>
              <button
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                className="mt-3 rounded-full border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-lime-400/60 hover:text-lime-300 active:scale-95"
              >
                Clear search &amp; filter
              </button>
            </div>
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}
