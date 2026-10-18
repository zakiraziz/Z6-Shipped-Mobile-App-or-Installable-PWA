import type { Preset, PresetStep, Segment } from '../types';

export const BUILTIN_PRESETS: Preset[] = [
  { id: 'tabata', name: 'Tabata', workSec: 20, restSec: 10, rounds: 8, builtin: true },
  { id: 'hiit', name: 'HIIT 45/15', workSec: 45, restSec: 15, rounds: 10, builtin: true },
  { id: 'boxing', name: 'Boxing rounds', workSec: 180, restSec: 60, rounds: 5, builtin: true },
  { id: 'pomodoro', name: 'Pomodoro', workSec: 1500, restSec: 300, rounds: 4, builtin: true },
  { id: 'sprint', name: 'Sprint 30/90', workSec: 30, restSec: 90, rounds: 6, builtin: true },
  { id: 'emom', name: 'EMOM 10', workSec: 40, restSec: 20, rounds: 10, builtin: true },
  // Built-in proof that a session need not be a loop: five named steps.
  {
    id: 'warmup-flow',
    name: 'Warm-up flow',
    workSec: 60,
    restSec: 30,
    rounds: 5,
    builtin: true,
    steps: [
      { kind: 'work', seconds: 60, label: 'Jump rope' },
      { kind: 'rest', seconds: 30, label: 'Stretch' },
      { kind: 'work', seconds: 120, label: 'Shadow box' },
      { kind: 'rest', seconds: 45, label: 'Breathe' },
      { kind: 'work', seconds: 180, label: 'Footwork' },
    ],
  },
];

/**
 * Mirror the classic work/rest/rounds fields from a step list, so a steps
 * preset stays valid for every consumer that predates steps (history rows,
 * summaries, resume, the preset form's classic mode).
 */
export function deriveClassicFromSteps(steps: PresetStep[]): {
  workSec: number;
  restSec: number;
  rounds: number;
} {
  const firstWork = steps.find((step) => step.kind === 'work');
  const firstRest = steps.find((step) => step.kind === 'rest');
  return {
    workSec: firstWork ? Math.max(5, Math.round(firstWork.seconds)) : Math.max(5, steps[0]?.seconds ?? 30),
    restSec: firstRest ? Math.round(firstRest.seconds) : 0,
    rounds: Math.min(99, Math.max(1, steps.length)),
  };
}

/**
 * Split a session (up to elapsedMs) into work time, rest time and fully
 * completed work rounds — powers the end-of-session summary.
 */
export function splitSession(
  segments: Segment[],
  elapsedMs: number
): { workMs: number; restMs: number; roundsCompleted: number } {
  let workMs = 0;
  let restMs = 0;
  let roundsCompleted = 0;
  let acc = 0;
  for (const segment of segments) {
    const consumed = Math.max(0, Math.min(segment.durationMs, elapsedMs - acc));
    if (segment.kind === 'work') {
      workMs += consumed;
      if (consumed >= segment.durationMs) roundsCompleted += 1;
    } else {
      restMs += consumed;
    }
    acc += segment.durationMs;
    if (acc >= elapsedMs) break;
  }
  return { workMs, restMs, roundsCompleted };
}

/** Work/rest segments for a preset. The final round has no trailing rest. */
export function buildSegments(preset: Preset): Segment[] {
  // Custom sequence: one segment per ordered step, labels and all.
  if (preset.steps && preset.steps.length > 0) {
    return preset.steps.map((step, index) => ({
      kind: step.kind,
      label: step.label?.trim() || (step.kind === 'work' ? 'Work' : 'Rest'),
      round: index + 1,
      durationMs: Math.min(3600, Math.max(1, Math.round(step.seconds))) * 1000,
    }));
  }
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
  if (preset.steps && preset.steps.length > 0) {
    return (
      preset.steps.reduce((sum, step) => sum + Math.min(3600, Math.max(1, step.seconds)), 0) * 1000
    );
  }
  const rests = Math.max(preset.rounds - 1, 0);
  return (preset.workSec * preset.rounds + preset.restSec * rests) * 1000;
}

/** Preset meta line: "20s work · 10s rest · 8 rounds" / "5 steps" */
export function presetSummary(preset: Preset): string {
  if (preset.steps && preset.steps.length > 0) {
    return `${preset.steps.length} steps`;
  }
  const rest = preset.restSec > 0 ? `${preset.restSec}s rest · ` : 'no rest · ';
  return `${preset.workSec}s work · ${rest}${preset.rounds} rounds`;
}
