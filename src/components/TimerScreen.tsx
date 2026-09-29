import { Check, Pause, Play, RotateCcw, SkipForward, Square, Zap } from 'lucide-react';
import { formatClock } from '../lib/format';
import { presetSummary, presetTotalMs } from '../lib/presets';
import { primeAudio } from '../lib/sound';
import { useAppState } from '../state';
import { TimerDisplay } from './TimerDisplay';

const secondaryButton =
  'flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition active:scale-95 disabled:opacity-30 disabled:active:scale-100';

export function TimerScreen() {
  const { presets, activePreset, selectPreset, timer } = useAppState();
  const { status } = timer;

  const locked = status === 'running' || status === 'paused';

  const primaryLabel =
    status === 'running'
      ? 'Pause timer'
      : status === 'paused'
        ? 'Resume timer'
        : status === 'finished'
          ? 'Start again'
          : 'Start timer';

  const handlePrimary = () => {
    primeAudio(); // must happen inside the gesture so audio is allowed later
    timer.toggle();
  };

  return (
    <div>
      {/* preset chips */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {presets.map((preset) => {
          const isActive = preset.id === activePreset.id;
          return (
            <button
              key={preset.id}
              onClick={() => selectPreset(preset.id)}
              disabled={locked}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isActive
                  ? 'border-lime-300 bg-lime-400 font-semibold text-slate-950'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      <TimerDisplay
        status={timer.status}
        segment={timer.segment}
        remainingMs={timer.segmentRemainingMs}
        segmentProgress={timer.segmentProgress}
        totalProgress={timer.totalProgress}
        totalRemainingMs={timer.totalRemainingMs}
        round={timer.round}
        rounds={timer.rounds}
      />

      {/* controls */}
      <div className="mt-7 flex items-center justify-center gap-7">
        <button
          onClick={timer.reset}
          disabled={status === 'idle'}
          aria-label="Reset timer"
          className={secondaryButton}
        >
          <RotateCcw size={20} />
        </button>

        <button
          onClick={handlePrimary}
          aria-label={primaryLabel}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-lime-400 text-slate-950 shadow-lg shadow-lime-400/20 transition active:scale-95"
        >
          {status === 'running' ? (
            <Pause size={34} fill="currentColor" />
          ) : (
            <Play size={34} fill="currentColor" className="ml-1" />
          )}
        </button>

        <button
          onClick={timer.skip}
          disabled={status === 'idle' || status === 'finished'}
          aria-label="Skip to next segment"
          className={secondaryButton}
        >
          <SkipForward size={20} />
        </button>
      </div>

      {(status === 'running' || status === 'paused') && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={timer.finish}
            className="flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-rose-400/60 hover:text-rose-300 active:scale-95"
          >
            <Square size={13} /> Finish &amp; save session
          </button>
        </div>
      )}

      {status === 'finished' && (
        <p className="mt-5 flex items-center justify-center gap-2 text-sm text-emerald-300">
          <Check size={16} /> Session saved to history
        </p>
      )}

      {/* active preset summary + offline note */}
      <div className="mt-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm font-semibold">{activePreset.name}</p>
        <p className="mt-0.5 text-sm text-slate-400">
          {presetSummary(activePreset)} · {formatClock(presetTotalMs(activePreset))} total
        </p>
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Zap size={14} className="mt-0.5 shrink-0 text-lime-300" />
          No connection needed — the timer, presets and history live on this device.
          Install Beep from your browser menu for a full-screen app.
        </p>
      </div>
    </div>
  );
}
