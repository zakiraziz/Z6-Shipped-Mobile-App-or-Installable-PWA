import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { BUILTIN_PRESETS, presetTotalMs } from './lib/presets';
import { uid } from './lib/format';
import { usePersistentState } from './hooks/usePersistentState';
import { useIntervalTimer, type TimerApi } from './hooks/useIntervalTimer';
import type { HistoryEntry, Preset, Settings } from './types';

/** newest 200 sessions are kept */
const MAX_HISTORY = 200;

type AppState = {
  presets: Preset[];
  activePreset: Preset;
  selectPreset: (id: string) => void;
  savePreset: (preset: Preset) => void;
  deletePreset: (id: string) => void;
  history: HistoryEntry[];
  clearHistory: () => void;
  settings: Settings;
  toggleSound: () => void;
  toggleVibrate: () => void;
  timer: TimerApi;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [customPresets, setCustomPresets] = usePersistentState<Preset[]>('beep.presets.v1', []);
  const [activePresetId, setActivePresetId] = usePersistentState<string>(
    'beep.active-preset.v1',
    BUILTIN_PRESETS[0].id
  );
  const [history, setHistory] = usePersistentState<HistoryEntry[]>('beep.history.v1', []);
  const [settings, setSettings] = usePersistentState<Settings>('beep.settings.v1', {
    sound: true,
    vibrate: true,
  });

  const presets = useMemo(() => [...BUILTIN_PRESETS, ...customPresets], [customPresets]);
  const activePreset = presets.find((preset) => preset.id === activePresetId) ?? presets[0];

  const selectPreset = useCallback(
    (id: string) => setActivePresetId(id),
    [setActivePresetId]
  );

  const savePreset = useCallback(
    (preset: Preset) => {
      setCustomPresets((current) => {
        const exists = current.some((item) => item.id === preset.id);
        if (exists) return current.map((item) => (item.id === preset.id ? preset : item));
        return [...current, preset];
      });
    },
    [setCustomPresets]
  );

  const deletePreset = useCallback(
    (id: string) => {
      setCustomPresets((current) => current.filter((item) => item.id !== id));
      setActivePresetId((current) => (current === id ? BUILTIN_PRESETS[0].id : current));
    },
    [setCustomPresets, setActivePresetId]
  );

  const addHistory = useCallback(
    (entry: HistoryEntry) =>
      setHistory((current) => [entry, ...current].slice(0, MAX_HISTORY)),
    [setHistory]
  );

  const clearHistory = useCallback(() => setHistory([]), [setHistory]);

  const handleTimerComplete = useCallback(
    (info: { completed: boolean; elapsedMs: number }) => {
      addHistory({
        id: uid(),
        presetName: activePreset.name,
        finishedAt: new Date().toISOString(),
        plannedSeconds: Math.round(presetTotalMs(activePreset) / 1000),
        elapsedSeconds: Math.round(info.elapsedMs / 1000),
        rounds: activePreset.rounds,
        completed: info.completed,
      });
    },
    [addHistory, activePreset]
  );

  const timer = useIntervalTimer(activePreset, settings, handleTimerComplete);

  const toggleSound = useCallback(
    () => setSettings((current) => ({ ...current, sound: !current.sound })),
    [setSettings]
  );
  const toggleVibrate = useCallback(
    () => setSettings((current) => ({ ...current, vibrate: !current.vibrate })),
    [setSettings]
  );

  const value = useMemo<AppState>(
    () => ({
      presets,
      activePreset,
      selectPreset,
      savePreset,
      deletePreset,
      history,
      clearHistory,
      settings,
      toggleSound,
      toggleVibrate,
      timer,
    }),
    [
      presets,
      activePreset,
      selectPreset,
      savePreset,
      deletePreset,
      history,
      clearHistory,
      settings,
      toggleSound,
      toggleVibrate,
      timer,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used inside <AppStateProvider>');
  return context;
}
