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

/**
 * Import outcome. `notes` reports EVERY rejected entry and unknown field —
 * silent drops are a debugging trap, so the UI shows what was skipped and why.
 */
export type ImportResult =
  | { ok: true; imported: Preset[]; skipped: number; notes: string[] }
  | { ok: false; error: string };

const BUILTIN_IDS = new Set(BUILTIN_PRESETS.map((preset) => preset.id));
const KNOWN_KEYS = new Set(['id', 'name', 'workSec', 'restSec', 'rounds', 'builtin']);

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
 * Every field is validated and clamped; invalid entries are rejected with a
 * per-entry note instead of disappearing silently.
 */
export function parsePresetFile(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'file is not valid JSON' };
  }

  const list: unknown = Array.isArray(data)
    ? data
    : (data as { presets?: unknown } | null)?.presets;
  if (!Array.isArray(list)) return { ok: false, error: 'no "presets" array found' };

  const imported: Preset[] = [];
  const notes: string[] = [];
  let skipped = 0;

  list.forEach((raw, index) => {
    const label = `#${index + 1}`;
    if (typeof raw !== 'object' || raw === null) {
      skipped += 1;
      notes.push(`${label}: not an object`);
      return;
    }
    const record = raw as Record<string, unknown>;

    const unknownKeys = Object.keys(record).filter((key) => !KNOWN_KEYS.has(key));
    if (unknownKeys.length > 0) {
      notes.push(
        `${label}: ignored unknown field "${unknownKeys[0]}"${
          unknownKeys.length > 1 ? ` +${unknownKeys.length - 1} more` : ''
        }`
      );
    }

    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 40) : '';
    const workSec = Math.round(Number(record.workSec));
    const restSec = Math.round(Number(record.restSec));
    const rounds = Math.round(Number(record.rounds));
    if (!name) {
      skipped += 1;
      notes.push(`${label}: missing name`);
      return;
    }
    if (!Number.isFinite(workSec) || !Number.isFinite(restSec) || !Number.isFinite(rounds)) {
      skipped += 1;
      notes.push(`${label}: workSec/restSec/rounds must be numbers`);
      return;
    }

    const id =
      typeof record.id === 'string' && record.id.length > 0 && !BUILTIN_IDS.has(record.id)
        ? record.id
        : uid();
    imported.push({
      id,
      name,
      workSec: Math.min(3600, Math.max(5, workSec)),
      restSec: Math.min(3600, Math.max(0, restSec)),
      rounds: Math.min(99, Math.max(1, rounds)),
      builtin: false,
    });
  });

  if (imported.length === 0 && skipped === 0) {
    return { ok: false, error: 'presets array is empty' };
  }
  return { ok: true, imported, skipped, notes };
}
