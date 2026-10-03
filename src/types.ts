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
  /** #7 "Run again" needs the shape, not just the name (older entries lack it) */
  workSec?: number;
  restSec?: number;
  /** #18 optional label the user gives the session ("Legs day") */
  label?: string;
};

export type Settings = {
  sound: boolean;
  vibrate: boolean;
  /** fire a cue at the midpoint of each segment (default off) */
  halfwayChime: boolean;
  /** oversized digits for across-the-room viewing */
  bigNumbers: boolean;
  /** speak phase/round changes via speechSynthesis */
  voice: boolean;
  /** swap skip/reset sides for left-handed thumb reach */
  leftHanded: boolean;
  /** #4 pause automatically when the app goes to the background (default off) */
  autoPause: boolean;
  /** #5 beep loudness, 0–1 (mute stays the header toggle) */
  volume: number;
};
