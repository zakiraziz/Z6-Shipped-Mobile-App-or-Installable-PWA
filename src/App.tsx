import { useEffect, useState } from 'react';
import { AppStateProvider, useAppState } from './state';
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
  const { timer } = useAppState();
  const [tab, setTab] = useState<TabId>('timer');

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
      <InstallBanner />
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
