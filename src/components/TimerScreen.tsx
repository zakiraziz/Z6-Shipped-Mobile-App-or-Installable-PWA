import { useState } from 'react';
import { BellOff, Check, Pause, Play, RotateCcw, SkipForward, Square, X, Zap } from 'lucide-react';
import { formatClock } from '../lib/format';
import { getNotificationState, requestNotifyPermissionOnce } from '../lib/notify';
import { presetSummary, presetTotalMs } from '../lib/presets';
import { primeAudio } from '../lib/sound';
import { usePersistentState } from '../hooks/usePersistentState';
import { useAppState } from '../state';
import { TimerDisplay } from './TimerDisplay';

const secondaryButton =
  'flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition active:scale-95 disabled:opacity-30 disabled:active:scale-100';

export function TimerScreen() {
  const { presets, activePreset, selectPreset, timer } = useAppState();
  const { status } = timer;

  const [notifyState, setNotifyState] = useState<NotificationPermission | 'unsupported'>(() =>
    getNotificationState()
  );
  const [notifyHintDismissed, setNotifyHintDismissed] = usePersistentState(
    'beep.notify.hint-dismissed',
    false
  );

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
    primeAudio(); // gesture → unlock Web Audio (incl. iOS activation blip)
    // First Start only, remembered, never nags — result drives the hint below.
    void requestNotifyPermissionOnce().then(setNotifyState);
    timer.toggle();
  };

  // Announced to screen readers on phase/status changes (not every tick).
  const announcement =
    status === 'idle'
      ? `${activePreset.name} ready. ${activePreset.rounds} rounds.`
      : status === 'finished'
        ? 'Session complete. Saved to history.'
        : status === 'paused'
          ? `Paused. ${timer.segment.label}, round ${timer.round} of ${timer.rounds}.`
          : `${timer.segment.label} started. Round ${timer.round} of ${timer.rounds}.`;

  return (
    <div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
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

      {/* Denied-permission UX: say it once, explain the fallback, allow dismiss */}
      {notifyState === 'denied' && !notifyHintDismissed && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/5 px-4 py-3">
          <BellOff size={14} className="mt-0.5 shrink-0 text-amber-300" />
          <p className="flex-1 text-xs leading-relaxed text-amber-200/90">
            Notifications are off — Beep still beeps and vibrates while the app is open. For
            lock-screen cues, allow notifications for this site in your browser settings.
          </p>
          <button
            onClick={() => setNotifyHintDismissed(true)}
            aria-label="Dismiss notification hint"
            className="shrink-0 rounded p-1 text-amber-300/70 transition hover:bg-amber-400/10"
          >
            <X size={14} />
          </button>
        </div>
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
