import { useEffect, useState } from 'react';
import { BellOff, Pause, Play, RotateCcw, Share2, SkipForward, Square, X, Zap } from 'lucide-react';
import { formatClock } from '../lib/format';
import { cueCountdown, testHaptics, testSound } from '../lib/cues';
import { getNotificationState, requestNotifyPermissionOnce } from '../lib/notify';
import { hasWakeLock } from '../lib/platform';
import { presetSummary, presetTotalMs } from '../lib/presets';
import { buildShareUrl } from '../lib/presets-io';
import { primeAudio } from '../lib/sound';
import { usePersistentState } from '../hooks/usePersistentState';
import { useAppState } from '../state';
import { SessionSummary } from './SessionSummary';
import { TimerDisplay } from './TimerDisplay';

const secondaryButton =
  'flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition active:scale-95 disabled:opacity-30 disabled:active:scale-100';

type Props = {
  /** #20: launched from a home-screen shortcut → start the 3-2-1 immediately */
  autoStart?: boolean;
  onAutoStartDone?: () => void;
  /** #3: routed through App's stop confirmation when the session is real */
  onRequestStop?: () => void;
};

export function TimerScreen({ autoStart, onAutoStartDone, onRequestStop }: Props) {
  const { presets, activePreset, selectPreset, timer, settings, toggleSetting, updateSetting } =
    useAppState();
  const { status } = timer;

  const [notifyState, setNotifyState] = useState<NotificationPermission | 'unsupported'>(() =>
    getNotificationState()
  );
  const [notifyHintDismissed, setNotifyHintDismissed] = usePersistentState(
    'beep.notify.hint-dismissed',
    false
  );
  const [wakeHintDismissed, setWakeHintDismissed] = usePersistentState(
    'beep.wakelock.hint-dismissed',
    false
  );
  /** #1: 3-2-1 get-ready countdown runs before the engine starts. */
  const [getReady, setGetReady] = useState<number | null>(null);
  const [shareStatus, setShareStatus] = useState('');

  const locked = status === 'running' || status === 'paused' || getReady !== null;

  const primaryLabel =
    getReady !== null
      ? 'Cancel countdown'
      : status === 'running'
        ? 'Pause timer'
        : status === 'paused'
          ? 'Resume timer'
          : status === 'finished'
            ? 'Start again'
            : 'Start timer';

  // Tick the countdown: beep on 3/2/1, then hand over to the engine.
  useEffect(() => {
    if (getReady === null) return;
    if (getReady === 0) {
      setGetReady(null);
      timer.start();
      return;
    }
    cueCountdown(settings);
    const id = window.setTimeout(() => setGetReady((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getReady]);

  // Switching preset mid-countdown would start the wrong workout.
  useEffect(() => {
    setGetReady(null);
  }, [activePreset.id]);

  // #20: a home-screen shortcut opened with ?autostart=1 — countdown now.
  // Deps: [autoStart], NOT [] — App reads the query string in its own effect,
  // which runs AFTER this child mounts, so the flag flips from false → true
  // and this must react to that change.
  useEffect(() => {
    if (autoStart && status === 'idle' && getReady === null) setGetReady(3);
    onAutoStartDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // #11: tint the status bar with the current phase (warm = work, cool = rest).
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const color =
      getReady !== null || status === 'idle'
        ? '#020617'
        : status === 'running'
          ? timer.segment.kind === 'work'
            ? '#7c2d12'
            : '#075985'
          : status === 'paused'
            ? '#1e293b'
            : '#065f46';
    meta.setAttribute('content', color);
  }, [getReady, status, timer.segment.kind]);

  const handlePrimary = () => {
    primeAudio(); // gesture → unlock Web Audio (incl. iOS activation blip)
    // First Start only, remembered, never nags — result drives the hint below.
    void requestNotifyPermissionOnce().then(setNotifyState);
    if (getReady !== null) {
      setGetReady(null); // second tap cancels the countdown
      return;
    }
    if (status === 'idle' || status === 'finished') {
      setGetReady(3);
      return;
    }
    timer.toggle();
  };

  const handleShare = async () => {
    const url = buildShareUrl(activePreset);
    const text = `${activePreset.name}: ${presetSummary(activePreset)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Beep — ${activePreset.name}`, text, url });
        setShareStatus('Shared!');
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus('Link copied');
      }
    } catch {
      setShareStatus('Sharing cancelled');
    }
    window.setTimeout(() => setShareStatus(''), 2500);
  };

  // Announced to screen readers on phase/status changes (not every tick).
  const announcement =
    getReady !== null
      ? `Get ready. ${getReady}.`
      : status === 'idle'
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
              className={`flex min-h-[44px] shrink-0 items-center rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
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

      {/* #3: the whole ring is one big tap target (start / pause / resume) */}
      <div
        role="button"
        tabIndex={0}
        aria-label={primaryLabel}
        onClick={handlePrimary}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handlePrimary();
          }
        }}
        className="relative cursor-pointer rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-lime-400/60"
      >
        <TimerDisplay
          status={timer.status}
          segment={timer.segment}
          nextSegment={timer.segments[timer.segmentIndex + 1] ?? null}
          remainingMs={timer.segmentRemainingMs}
          segmentProgress={timer.segmentProgress}
          totalProgress={timer.totalProgress}
          totalRemainingMs={timer.totalRemainingMs}
          round={timer.round}
          rounds={timer.rounds}
        />

        {/* #1: GET READY overlay — the engine stays idle until it hits 0 */}
        {getReady !== null && (
          <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
            <div className="flex h-72 w-72 flex-col items-center justify-center gap-3 rounded-full bg-slate-950/95 backdrop-blur-sm">
              <span className="text-xs font-bold tracking-[0.3em] text-slate-400">GET READY</span>
              <span className="text-[96px] font-bold leading-none tabular-nums text-lime-300">
                {getReady}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* controls */}
      {/* #12: left-handed mode swaps the secondary controls' sides */}
      <div
        className={`mt-7 flex items-center justify-center gap-7 ${
          settings.leftHanded ? 'flex-row-reverse' : ''
        }`}
      >
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
            onClick={() =>
              onRequestStop && timer.elapsed >= 5000 ? onRequestStop() : timer.finish()
            }
            className="flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-rose-400/60 hover:text-rose-300 active:scale-95"
          >
            <Square size={13} /> Finish &amp; save session
          </button>
        </div>
      )}

      {/* #5: the payoff screen — what the session actually was */}
      {status === 'finished' && <SessionSummary />}

      {/* #12: honest fallback when the platform has no Wake Lock */}
      {!hasWakeLock() && !wakeHintDismissed && (status === 'running' || status === 'paused') && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-sky-400/30 bg-sky-400/5 px-4 py-3">
          <Zap size={14} className="mt-0.5 shrink-0 text-sky-300" />
          <p className="flex-1 text-xs leading-relaxed text-sky-200/90">
            This browser can't hold the screen on, so it may dim mid-session. Keep tapping or use
            your phone's auto-bright setting.
          </p>
          <button
            onClick={() => setWakeHintDismissed(true)}
            aria-label="Dismiss wake lock hint"
            className="shrink-0 rounded p-1 text-sky-300/70 transition hover:bg-sky-400/10"
          >
            <X size={14} />
          </button>
        </div>
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

      {/* active preset + share + preferences */}
      <div className="mt-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{activePreset.name}</p>
            <p className="mt-0.5 text-sm text-slate-400">
              {presetSummary(activePreset)} · {formatClock(presetTotalMs(activePreset))} total
            </p>
          </div>
          <button
            onClick={handleShare}
            className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 active:scale-95"
          >
            <Share2 size={13} /> Share
          </button>
        </div>
        {shareStatus && (
          <p className="mt-1 text-xs text-lime-300" role="status">
            {shareStatus}
          </p>
        )}

        {/* #9 #10 #11 #12 — preferences live where they're used */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          <PrefChip
            label="Big numbers"
            on={settings.bigNumbers}
            onClick={() => toggleSetting('bigNumbers')}
          />
          <PrefChip
            label="Halfway chime"
            on={settings.halfwayChime}
            onClick={() => toggleSetting('halfwayChime')}
          />
          <PrefChip
            label="Voice cues"
            on={settings.voice}
            onClick={() => toggleSetting('voice')}
          />
          <PrefChip
            label="Left-handed"
            on={settings.leftHanded}
            onClick={() => toggleSetting('leftHanded')}
          />
          <PrefChip
            label="Auto-pause"
            on={settings.autoPause}
            onClick={() => toggleSetting('autoPause')}
          />
        </div>

        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
            <label htmlFor="beep-volume" className="font-medium">
              Volume
            </label>
            <span className="tabular-nums">{Math.round(settings.volume * 100)}%</span>
          </div>
          <input
            id="beep-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(event) => updateSetting('volume', Number(event.target.value))}
            className="h-2 w-full cursor-pointer accent-lime-400"
            aria-label="Volume"
          />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => testSound(settings)}
            className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition active:scale-95"
          >
            Test sound
          </button>
          <button
            type="button"
            onClick={() => {
              const ok = testHaptics();
              if (!ok) {
                window.alert('This device does not support vibration cues.');
              }
            }}
            className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition active:scale-95"
          >
            Test haptics
          </button>
        </div>

        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Zap size={14} className="mt-0.5 shrink-0 text-lime-300" />
          No connection needed — the timer, presets and history live on this device.
          Install Beep from your browser menu for a full-screen app.
        </p>
      </div>
    </div>
  );
}

function PrefChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
        on ? 'border-lime-400/70 bg-lime-400/10 text-lime-300' : 'border-slate-700 text-slate-400'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-lime-300' : 'bg-slate-600'}`}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}
