import { uid } from './format';
import { BUILTIN_PRESETS } from './presets';
import type { Preset } from '../types';

export type PresetFile = {
  app: 'beep';
  kind: 'presets';
  version: 1;
  exportedAt: string;
  presets: Preset[];
};

const BUILTIN_IDS = new Set(BUILTIN_PRESETS.map((preset) => preset.id));

/** Serialise custom presets into a shareable/backup JSON file. */
export function serializePresets(custom: Preset[]): string {
  const file: PresetFile = {
    app: 'beep',
    kind: 'presets',
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: custom.map((preset) => ({ ...preset, builtin: false })),
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Parse an imported file (our format, or a bare preset array).
 * Every field is validated and clamped — returns null if nothing usable.
 */
export function parsePresetFile(text: string): Preset[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  const list: unknown = Array.isArray(data)
    ? data
    : (data as { presets?: unknown } | null)?.presets;
  if (!Array.isArray(list)) return null;

  const parsed: Preset[] = [];
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 40) : '';
    const workSec = Math.round(Number(record.workSec));
    const restSec = Math.round(Number(record.restSec));
    const rounds = Math.round(Number(record.rounds));
    if (!name || !Number.isFinite(workSec) || !Number.isFinite(restSec) || !Number.isFinite(rounds)) {
      continue;
    }
    const id =
      typeof record.id === 'string' && record.id.length > 0 && !BUILTIN_IDS.has(record.id)
        ? record.id
        : uid();
    parsed.push({
      id,
      name,
      workSec: Math.min(3600, Math.max(5, workSec)),
      restSec: Math.min(3600, Math.max(0, restSec)),
      rounds: Math.min(99, Math.max(1, rounds)),
      builtin: false,
    });
  }
  return parsed.length > 0 ? parsed : null;
}
