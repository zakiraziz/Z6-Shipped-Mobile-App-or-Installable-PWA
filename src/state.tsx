import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { BUILTIN_PRESETS, presetTotalMs } from './lib/presets';
import { uid } from './lib/format';
import { usePersistentState } from './hooks/usePersistentState';
import { useIntervalTimer, type TimerApi } from './hooks/useIntervalTimer';
import type { HistoryEntry, Preset, Settings } from './types';

/** newest 200 sessions are kept */
const MAX_HISTORY = 200;

/** Defaults merged over persisted settings so old saves gain new flags. */
export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  vibrate: true,
  halfwayChime: false,
  bigNumbers: false,
  voice: false,
  leftHanded: false,
};

type AppState = {
  presets: Preset[];
  activePreset: Preset;
  selectPreset: (id: string) => void;
  savePreset: (preset: Preset) => void;
  deletePreset: (id: string) => void;
  moveCustomPreset: (id: string, direction: -1 | 1) => void;
  history: HistoryEntry[];
  clearHistory: () => void;
  settings: Settings;
  toggleSetting: (key: keyof Settings) => void;
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
  const [settings, setSettings] = usePersistentState<Settings>('beep.settings.v1', DEFAULT_SETTINGS);
  // Older saves predate newer flags — merge so every key always exists.
  const mergedSettings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...settings }), [settings]);

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

  /** Touch + keyboard friendly reordering of custom presets (order persists). */
  const moveCustomPreset = useCallback(
    (id: string, direction: -1 | 1) => {
      setCustomPresets((current) => {
        const index = current.findIndex((item) => item.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= current.length) return current;
        const next = [...current];
        const moved = next[index];
        next[index] = next[target];
        next[target] = moved;
        return next;
      });
    },
    [setCustomPresets]
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

  const timer = useIntervalTimer(activePreset, mergedSettings, handleTimerComplete);

  const toggleSetting = useCallback(
    (key: keyof Settings) => setSettings((current) => ({ ...current, [key]: !current[key] })),
    [setSettings]
  );

  const value = useMemo<AppState>(
    () => ({
      presets,
      activePreset,
      selectPreset,
      savePreset,
      deletePreset,
      moveCustomPreset,
      history,
      clearHistory,
      settings: mergedSettings,
      toggleSetting,
      timer,
    }),
    [
      presets,
      activePreset,
      selectPreset,
      savePreset,
      deletePreset,
      moveCustomPreset,
      history,
      clearHistory,
      mergedSettings,
      toggleSetting,
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
