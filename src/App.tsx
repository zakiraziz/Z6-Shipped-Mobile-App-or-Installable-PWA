import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AppStateProvider, useAppState } from './state';
import { decodeSharedPreset } from './lib/presets-io';
import { clearSession, readSession, type StoredSession } from './lib/session-store';
import type { Preset } from './types';
import { Header } from './components/Header';
import { TabBar, type TabId } from './components/TabBar';
import { TimerScreen } from './components/TimerScreen';
import { PresetsScreen } from './components/PresetsScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { InstallBanner } from './components/InstallBanner';
import { UpdateToast } from './components/UpdateToast';
import { ResumeCard } from './components/ResumeCard';
import { useWakeLock } from './hooks/useWakeLock';
import { clearCueNotifications } from './lib/notify';
import { resumeAudio } from './lib/sound';

function Shell() {
  const { timer, savePreset, selectPreset, presets, activePreset, settings } = useAppState();
  const [tab, setTab] = useState<TabId>('timer');
  /** #20 receive side: ?p=<token> offers a shared preset to import. */
  const [sharedPreset, setSharedPreset] = useState<Preset | null>(null);
  /** #1: a session interrupted by a kill/eviction, offered back on cold launch. */
  const [resumeOffer, setResumeOffer] = useState<StoredSession | null>(null);
  const [pendingResume, setPendingResume] = useState<{ presetId: string; elapsedMs: number } | null>(
    null
  );
  /** #3: confirmation before destroying an active session. */
  const [stopConfirm, setStopConfirm] = useState(false);
  /** #20: launch shortcuts open with ?preset=…&autostart=1 */
  const [autoStart, setAutoStart] = useState(false);

  const timerRef = useRef(timer);
  timerRef.current = timer;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const pushedSessionRef = useRef(false);

  // Shared-preset link + #20 launch shortcuts.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('p');
    if (token) {
      const decoded = decodeSharedPreset(token);
      if (decoded) setSharedPreset(decoded);
      else window.history.replaceState(null, '', window.location.pathname);
    }
    const presetParam = params.get('preset');
    if (presetParam && presets.some((item) => item.id === presetParam)) {
      selectPreset(presetParam);
    }
    if (params.get('autostart') === '1') setAutoStart(true);
    // Runs once at boot — presets/selectPreset are stable enough for this read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #1: read a session the previous run never finished.
  useEffect(() => {
    const stored = readSession();
    if (stored) setResumeOffer(stored);
  }, []);

  // #1: apply the saved position once the active preset is the restored one.
  useEffect(() => {
    if (!pendingResume) return;
    if (activePreset.id !== pendingResume.presetId) return;
    timer.restore(pendingResume.elapsedMs);
    setPendingResume(null);
  }, [pendingResume, activePreset.id, timer]);

  const resumeSession = () => {
    if (!resumeOffer) return;
    const stored = resumeOffer;
    if (!presets.some((item) => item.id === stored.presetId)) {
      savePreset({
        id: stored.presetId,
        name: stored.presetName,
        workSec: stored.workSec,
        restSec: stored.restSec,
        rounds: stored.rounds,
        builtin: false,
      });
    }
    selectPreset(stored.presetId);
    setPendingResume({ presetId: stored.presetId, elapsedMs: stored.elapsedMs });
    setResumeOffer(null);
    setTab('timer');
  };

  const discardSession = () => {
    clearSession();
    setResumeOffer(null);
  };

  const clearSharedParam = () =>
    window.history.replaceState(null, '', window.location.pathname);

  const acceptSharedPreset = () => {
    if (!sharedPreset) return;
    savePreset(sharedPreset);
    selectPreset(sharedPreset.id);
    setSharedPreset(null);
    clearSharedParam();
  };

  const declineSharedPreset = () => {
    setSharedPreset(null);
    clearSharedParam();
  };

  // Keep the screen awake while a session is running (Wake Lock API).
  useWakeLock(timer.status === 'running');

  useEffect(() => {
    // Ask the browser to treat our storage as persistent (harder to evict the
    // SW cache / history). Browsers grant silently or decline — no prompt.
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* unsupported — ignore */
    }

    // When the user comes back: close lingering cue notifications and re-arm
    // the AudioContext (iOS suspends it while backgrounded).
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      clearCueNotifications();
      resumeAudio();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // #4: the "Auto-pause" chip sets the preference — this is the behavior.
  const autoPause = settings.autoPause;
  useEffect(() => {
    if (!autoPause) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && timerRef.current.status === 'running') {
        timerRef.current.pause();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [autoPause]);

  // #2: an active session is a guarded exit, never a silent discard.
  const sessionActive = timer.status === 'running' || timer.status === 'paused';
  useEffect(() => {
    if (sessionActive && !pushedSessionRef.current) {
      pushedSessionRef.current = true;
      window.history.pushState({ beep: 'session' }, '');
    } else if (!sessionActive) {
      pushedSessionRef.current = false;
    }
  }, [sessionActive]);

  useEffect(() => {
    const onPopState = () => {
      const active = timerRef.current.status === 'running' || timerRef.current.status === 'paused';
      if (active) {
        // Android back mid-session → stop-and-confirm, never a silent loss.
        timerRef.current.pause();
        setStopConfirm(true);
        window.history.pushState({ beep: 'session' }, ''); // guard for the next back too
        pushedSessionRef.current = true;
        return;
      }
      if (tabRef.current !== 'timer') setTab('timer');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const confirmKeepGoing = () => {
    setStopConfirm(false);
    if (timerRef.current.status === 'paused') timerRef.current.start(); // resumes
  };

  const confirmStop = () => {
    setStopConfirm(false);
    timerRef.current.finish();
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
      <Header />
      {resumeOffer && (
        <ResumeCard session={resumeOffer} onResume={resumeSession} onDiscard={discardSession} />
      )}
      <main className="flex-1 px-4 pb-32 pt-5">
        {tab === 'timer' && (
          <TimerScreen
            autoStart={autoStart}
            onAutoStartDone={() => setAutoStart(false)}
            onRequestStop={() => setStopConfirm(true)}
          />
        )}
        {tab === 'presets' && <PresetsScreen />}
        {tab === 'history' && <HistoryScreen onNavigate={setTab} />}
      </main>

      {/* #3: destructive action needs one deliberate tap */}
      {stopConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Stop session"
        >
          <div className="w-full max-w-xs rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
            <p className="text-base font-semibold">Stop this session?</p>
            <p className="mt-1 text-sm text-slate-400">
              Finishing saves it to your history. Keep going to carry on from{' '}
              {Math.floor(timer.elapsed / 1000)}s.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmKeepGoing}
                className="flex-1 rounded-full border border-slate-700 bg-slate-950 py-2.5 text-sm font-semibold text-slate-200 transition active:scale-95"
              >
                Keep going
              </button>
              <button
                onClick={confirmStop}
                className="flex-1 rounded-full bg-rose-500 py-2.5 text-sm font-bold text-white transition active:scale-95"
              >
                Stop &amp; save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* #20 receive side: offer the shared preset */}
      {sharedPreset && (
        <div className="fixed inset-x-0 bottom-[76px] z-30 mx-auto w-full max-w-md px-3">
          <div className="flex items-center gap-3 rounded-2xl border border-sky-400/30 bg-slate-900/95 p-3 shadow-xl shadow-black/40 backdrop-blur">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Shared: {sharedPreset.name}</p>
              <p className="text-xs text-slate-400">
                {sharedPreset.workSec}s work · {sharedPreset.restSec}s rest ·{' '}
                {sharedPreset.rounds} rounds
              </p>
            </div>
            <button
              onClick={acceptSharedPreset}
              className="shrink-0 rounded-full bg-lime-400 px-4 py-2 text-xs font-bold text-slate-950 transition active:scale-95"
            >
              Add
            </button>
            <button
              onClick={declineSharedPreset}
              aria-label="Dismiss shared preset"
              className="shrink-0 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {!sharedPreset && <InstallBanner />}
      <UpdateToast />
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
