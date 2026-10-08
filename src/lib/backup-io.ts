import { uid } from './format';
import { parsePresetArray } from './presets-io';
import type { HistoryEntry, Preset, Settings, SoundTheme } from '../types';

/**
 * One-file full backup: presets + history + settings, so moving to a new
 * phone (or rescuing data from a dying one) is a single download + restore.
 *
 * Restore is a MERGE, never a replace — entries already on the device always
 * win (dedup by id), settings only overlay keys the file actually carries,
 * and every rejected field is reported. The parser is deliberately strict:
 * a file that isn't ours is refused with a human sentence instead of
 * half-loading garbage into localStorage.
 */
export type BackupData = {
  presets: Preset[];
  history: HistoryEntry[];
  settings: Partial<Settings>;
};

export type BackupFile = {
  app: 'beep';
  kind: 'backup';
  version: 1;
  exportedAt: string;
} & BackupData;

export type RestoreResult =
  | ({ ok: true; skipped: number; notes: string[] } & BackupData)
  | { ok: false; error: string };

const SOUND_THEMES: SoundTheme[] = ['beep', 'chime', 'click'];
const BOOLEAN_KEYS = [
  'sound',
  'vibrate',
  'halfwayChime',
  'bigNumbers',
  'voice',
  'leftHanded',
  'autoPause',
] as const;
const GET_READY_OPTIONS = [0, 3, 5, 10];
/** Guard against a hostile 50 MB "backup" freezing the tab on restore. */
const MAX_HISTORY = 500;

/** Serialise everything this device knows into the backup file shape. */
export function serializeBackup(data: BackupData): string {
  const file: BackupFile = {
    app: 'beep',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: data.presets.map((preset) => ({ ...preset, builtin: false })),
    history: data.history.map((entry) => ({ ...entry })),
    settings: { ...data.settings },
  };
  return JSON.stringify(file, null, 2);
}

/** Validate + clamp history rows; same philosophy as preset import. */
function parseHistory(list: unknown[]): {
  entries: HistoryEntry[];
  skipped: number;
  notes: string[];
} {
  const entries: HistoryEntry[] = [];
  const notes: string[] = [];
  let skipped = 0;

  list.slice(0, MAX_HISTORY * 10).forEach((raw, index) => {
    const label = `history #${index + 1}`;
    if (typeof raw !== 'object' || raw === null) {
      skipped += 1;
      notes.push(`${label}: not an object`);
      return;
    }
    const record = raw as Record<string, unknown>;
    const presetName =
      typeof record.presetName === 'string' ? record.presetName.trim().slice(0, 40) : '';
    const finishedAt = typeof record.finishedAt === 'string' ? record.finishedAt : '';
    const planned = Number(record.plannedSeconds);
    const elapsed = Number(record.elapsedSeconds);
    const rounds = Number(record.rounds);

    if (!presetName || !Number.isFinite(Date.parse(finishedAt))) {
      skipped += 1;
      notes.push(`${label}: needs a presetName and a valid finishedAt date`);
      return;
    }
    if (!Number.isFinite(planned) || !Number.isFinite(elapsed) || !Number.isFinite(rounds)) {
      skipped += 1;
      notes.push(`${label}: plannedSeconds/elapsedSeconds/rounds must be numbers`);
      return;
    }

    const workSec = record.workSec === undefined ? undefined : Number(record.workSec);
    const restSec = record.restSec === undefined ? undefined : Number(record.restSec);
    const entryLabel = typeof record.label === 'string' ? record.label.trim().slice(0, 60) : '';

    entries.push({
      id: typeof record.id === 'string' && record.id.length > 0 ? record.id : uid(),
      presetName,
      finishedAt: new Date(finishedAt).toISOString(),
      plannedSeconds: Math.max(0, Math.round(planned)),
      elapsedSeconds: Math.max(0, Math.round(elapsed)),
      rounds: Math.min(999, Math.max(1, Math.round(rounds))),
      completed: record.completed === true,
      workSec:
        workSec !== undefined && Number.isFinite(workSec)
          ? Math.min(3600, Math.max(0, Math.round(workSec)))
          : undefined,
      restSec:
        restSec !== undefined && Number.isFinite(restSec)
          ? Math.min(3600, Math.max(0, Math.round(restSec)))
          : undefined,
      label: entryLabel || undefined,
    });
  });

  return { entries, skipped, notes };
}

/** Validate settings key-by-key — only known keys, right types, clamped. */
function parseSettings(raw: Record<string, unknown>): {
  settings: Partial<Settings>;
  skipped: number;
  notes: string[];
} {
  const settings: Partial<Settings> = {};
  const notes: string[] = [];
  let skipped = 0;
  const known = new Set<string>([...BOOLEAN_KEYS, 'volume', 'getReadySec', 'soundTheme']);

  for (const key of Object.keys(raw)) {
    if (!known.has(key)) notes.push(`settings: ignored unknown field "${key}"`);
  }

  for (const key of BOOLEAN_KEYS) {
    if (!(key in raw)) continue;
    if (typeof raw[key] === 'boolean') settings[key] = raw[key];
    else {
      skipped += 1;
      notes.push(`settings.${key}: not a boolean — skipped`);
    }
  }

  if ('volume' in raw) {
    const volume = Number(raw.volume);
    if (Number.isFinite(volume)) settings.volume = Math.min(1, Math.max(0, volume));
    else {
      skipped += 1;
      notes.push('settings.volume: not a number — skipped');
    }
  }

  if ('getReadySec' in raw) {
    const value = Math.round(Number(raw.getReadySec));
    if (GET_READY_OPTIONS.includes(value)) settings.getReadySec = value;
    else {
      skipped += 1;
      notes.push('settings.getReadySec: not one of off/3/5/10 — skipped');
    }
  }

  if ('soundTheme' in raw) {
    const value = raw.soundTheme;
    if (typeof value === 'string' && SOUND_THEMES.includes(value as SoundTheme)) {
      settings.soundTheme = value as SoundTheme;
    } else {
      skipped += 1;
      notes.push('settings.soundTheme: unknown theme — skipped');
    }
  }

  return { settings, skipped, notes };
}

/**
 * Parse a backup file. Returns ok:false with a sentence the UI can show
 * verbatim; ok:true carries the validated data plus every note about what was
 * clamped, skipped or ignored — silence is the failure mode this format
 * exists to avoid.
 */
export function parseBackup(text: string): RestoreResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'file is not valid JSON' };
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'not a Beep backup file' };
  }
  const record = data as Record<string, unknown>;

  if (record.kind === 'presets') {
    return { ok: false, error: 'that is a presets-only export — use Import above' };
  }
  if (record.kind !== 'backup') {
    return { ok: false, error: 'not a Beep backup file' };
  }

  const notes: string[] = [];
  let skipped = 0;

  let presets: Preset[] = [];
  if (record.presets !== undefined) {
    if (Array.isArray(record.presets)) {
      const result = parsePresetArray(record.presets);
      presets = result.imported;
      skipped += result.skipped;
      notes.push(...result.notes.map((note) => `presets ${note}`));
    } else {
      skipped += 1;
      notes.push('presets: not an array — skipped');
    }
  }

  let history: HistoryEntry[] = [];
  if (record.history !== undefined) {
    if (Array.isArray(record.history)) {
      const result = parseHistory(record.history);
      history = result.entries;
      skipped += result.skipped;
      notes.push(...result.notes);
    } else {
      skipped += 1;
      notes.push('history: not an array — skipped');
    }
  }

  let settings: Partial<Settings> = {};
  if (record.settings !== undefined) {
    if (typeof record.settings === 'object' && record.settings !== null) {
      const result = parseSettings(record.settings as Record<string, unknown>);
      settings = result.settings;
      skipped += result.skipped;
      notes.push(...result.notes);
    } else {
      skipped += 1;
      notes.push('settings: not an object — skipped');
    }
  }

  if (
    presets.length === 0 &&
    history.length === 0 &&
    Object.keys(settings).length === 0 &&
    record.presets === undefined &&
    record.history === undefined &&
    record.settings === undefined
  ) {
    return { ok: false, error: 'backup file is empty' };
  }

  return { ok: true, presets, history, settings, skipped, notes };
}
