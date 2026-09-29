export type Preset = {
  id: string;
  name: string;
  /** length of one work interval, in seconds */
  workSec: number;
  /** length of one rest interval, in seconds */
  restSec: number;
  rounds: number;
  /** built-in presets cannot be edited or deleted */
  builtin?: boolean;
};

export type SegmentKind = 'work' | 'rest';

export type Segment = {
  kind: SegmentKind;
  label: string;
  round: number;
  durationMs: number;
};

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export type HistoryEntry = {
  id: string;
  presetName: string;
  /** ISO timestamp of when the session ended */
  finishedAt: string;
  /** what the preset planned, in seconds */
  plannedSeconds: number;
  /** how far the timer actually got, in seconds */
  elapsedSeconds: number;
  rounds: number;
  /** true when the timer ran to the end by itself */
  completed: boolean;
};

export type Settings = {
  sound: boolean;
  vibrate: boolean;
};
