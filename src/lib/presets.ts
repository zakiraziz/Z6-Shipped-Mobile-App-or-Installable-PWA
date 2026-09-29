import type { Preset, Segment } from '../types';

export const BUILTIN_PRESETS: Preset[] = [
  { id: 'tabata', name: 'Tabata', workSec: 20, restSec: 10, rounds: 8, builtin: true },
  { id: 'hiit', name: 'HIIT 45/15', workSec: 45, restSec: 15, rounds: 10, builtin: true },
  { id: 'boxing', name: 'Boxing rounds', workSec: 180, restSec: 60, rounds: 5, builtin: true },
  { id: 'pomodoro', name: 'Pomodoro', workSec: 1500, restSec: 300, rounds: 4, builtin: true },
  { id: 'sprint', name: 'Sprint 30/90', workSec: 30, restSec: 90, rounds: 6, builtin: true },
];

/** Work/rest segments for a preset. The final round has no trailing rest. */
export function buildSegments(preset: Preset): Segment[] {
  const segments: Segment[] = [];
  for (let round = 1; round <= preset.rounds; round += 1) {
    segments.push({ kind: 'work', label: 'Work', round, durationMs: preset.workSec * 1000 });
    if (round < preset.rounds && preset.restSec > 0) {
      segments.push({ kind: 'rest', label: 'Rest', round, durationMs: preset.restSec * 1000 });
    }
  }
  return segments;
}

/** Total planned duration of a preset in milliseconds. */
export function presetTotalMs(preset: Preset): number {
  const rests = Math.max(preset.rounds - 1, 0);
  return (preset.workSec * preset.rounds + preset.restSec * rests) * 1000;
}

/** Preset meta line: "20s work · 10s rest · 8 rounds · 4:00 total" */
export function presetSummary(preset: Preset): string {
  const rest = preset.restSec > 0 ? `${preset.restSec}s rest · ` : 'no rest · ';
  return `${preset.workSec}s work · ${rest}${preset.rounds} rounds`;
}
