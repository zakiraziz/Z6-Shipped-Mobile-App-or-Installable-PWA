import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AppStateProvider, useAppState } from './state';
import { decodeSharedPreset } from './lib/presets-io';
import type { Preset } from './types';
import { Header } from './components/Header';
import { TabBar, type TabId } from './components/TabBar';
import { TimerScreen } from './components/TimerScreen';
import { PresetsScreen } from './components/PresetsScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { InstallBanner } from './components/InstallBanner';
import { UpdateToast } from './components/UpdateToast';
import { useWakeLock } from './hooks/useWakeLock';
import { clearCueNotifications } from './lib/notify';
import { resumeAudio } from './lib/sound';

function Shell() {
  const { timer, savePreset, selectPreset } = useAppState();
  const [tab, setTab] = useState<TabId>('timer');
  /** #20 receive side: ?p=<token> offers a shared preset to import. */
  const [sharedPreset, setSharedPreset] = useState<Preset | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('p');
    if (!token) return;
    const decoded = decodeSharedPreset(token);
    if (decoded) {
      setSharedPreset(decoded);
    } else {
      // Strip garbage so we don't re-read a broken token on every render.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

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

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
      <Header />
      <main className="flex-1 px-4 pb-32 pt-5">
        {tab === 'timer' && <TimerScreen />}
        {tab === 'presets' && <PresetsScreen />}
        {tab === 'history' && <HistoryScreen />}
      </main>
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
