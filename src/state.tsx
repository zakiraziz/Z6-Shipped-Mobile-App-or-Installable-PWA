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
  autoPause: false,
  volume: 0.7,
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
  /** #18 label a saved session ("Legs day") */
  updateHistoryEntry: (id: string, patch: Partial<HistoryEntry>) => void;
  settings: Settings;
  toggleSetting: (key: keyof Settings) => void;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
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

  const updateHistoryEntry = useCallback(
    (id: string, patch: Partial<HistoryEntry>) =>
      setHistory((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
      ),
    [setHistory]
  );

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
        // #7 "Run again" needs the full shape, not just the name
        workSec: activePreset.workSec,
        restSec: activePreset.restSec,
      });
    },
    [addHistory, activePreset]
  );

  const timer = useIntervalTimer(activePreset, mergedSettings, handleTimerComplete);

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((current) => ({ ...DEFAULT_SETTINGS, ...current, [key]: value }));
    },
    [setSettings]
  );

  const toggleSetting = useCallback(
    (key: keyof Settings) => {
      if (key === 'volume') {
        updateSetting(key, mergedSettings.volume > 0 ? 0 : 0.7);
        return;
      }
      setSettings((current) => ({ ...DEFAULT_SETTINGS, ...current, [key]: !current[key] }));
    },
    [mergedSettings.volume, updateSetting, setSettings]
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
      updateHistoryEntry,
      settings: mergedSettings,
      toggleSetting,
      updateSetting,
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
      updateHistoryEntry,
      mergedSettings,
      toggleSetting,
      updateSetting,
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
