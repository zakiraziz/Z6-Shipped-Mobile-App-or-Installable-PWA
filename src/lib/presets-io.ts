import { uid } from './format';
import { BUILTIN_PRESETS, deriveClassicFromSteps } from './presets';
import type { Preset, PresetStep } from '../types';

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
const KNOWN_KEYS = new Set(['id', 'name', 'workSec', 'restSec', 'rounds', 'builtin', 'steps']);
/** Guard against a hostile "5000-step" preset freezing the editor. */
const MAX_STEPS = 60;

/**
 * Validate a raw steps array: work/rest kind, clamped seconds, optional
 * label. Returns null when nothing usable is left — the caller decides
 * whether that's a rejection or a fallback to the classic fields.
 */
function normalizeSteps(raw: unknown): { steps: PresetStep[] | null; invalid: number } {
  if (!Array.isArray(raw) || raw.length === 0) return { steps: null, invalid: 0 };
  const steps: PresetStep[] = [];
  let invalid = 0;
  raw.forEach((entry) => {
    if (steps.length >= MAX_STEPS) {
      invalid += 1;
      return;
    }
    if (typeof entry !== 'object' || entry === null) {
      invalid += 1;
      return;
    }
    const record = entry as Record<string, unknown>;
    const kind = record.kind === 'work' ? 'work' : record.kind === 'rest' ? 'rest' : null;
    const seconds = Math.round(Number(record.seconds));
    if (!kind || !Number.isFinite(seconds)) {
      invalid += 1;
      return;
    }
    const label = typeof record.label === 'string' ? record.label.trim().slice(0, 40) : '';
    steps.push({
      kind,
      seconds: Math.min(3600, Math.max(1, seconds)),
      ...(label ? { label } : {}),
    });
  });
  return { steps: steps.length > 0 ? steps : null, invalid };
}

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
 * Validate + clamp one raw preset entry list (shared by file import and the
 * full-backup restore, so both accept exactly the same shape and reject the
 * same garbage).
 */
export function parsePresetArray(list: unknown[]): {
  imported: Preset[];
  skipped: number;
  notes: string[];
} {
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

    // Custom sequence steps — validated like everything else, never trusted.
    let steps: PresetStep[] | undefined;
    if (record.steps !== undefined) {
      if (Array.isArray(record.steps)) {
        const result = normalizeSteps(record.steps);
        steps = result.steps ?? undefined;
        if (result.invalid > 0) {
          skipped += result.invalid;
          notes.push(`${label}: dropped ${result.invalid} invalid step(s)`);
        }
        if (!steps) notes.push(`${label}: steps list unusable — kept work/rest fields`);
      } else {
        skipped += 1;
        notes.push(`${label}: steps is not an array — ignored`);
      }
    }

    const id =
      typeof record.id === 'string' && record.id.length > 0 && !BUILTIN_IDS.has(record.id)
        ? record.id
        : uid();
    const classic = steps
      ? deriveClassicFromSteps(steps)
      : {
          workSec: Math.min(3600, Math.max(5, workSec)),
          restSec: Math.min(3600, Math.max(0, restSec)),
          rounds: Math.min(99, Math.max(1, rounds)),
        };
    imported.push({
      id,
      name,
      ...classic,
      builtin: false,
      ...(steps ? { steps } : {}),
    });
  });

  return { imported, skipped, notes };
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

  const { imported, skipped, notes } = parsePresetArray(list);
  if (imported.length === 0 && skipped === 0) {
    return { ok: false, error: 'presets array is empty' };
  }
  return { ok: true, imported, skipped, notes };
}

/* ---------- share-a-preset-as-a-link (?p=<base64url>) ---------- */

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(param: string): Uint8Array {
  const padded = param.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Encode one preset into a URL-safe token (UTF-8 safe). */
export function encodeSharedPreset(preset: Preset): string {
  const json = JSON.stringify({ ...preset, builtin: false });
  return toBase64Url(new TextEncoder().encode(json));
}

/** Decode a ?p= token — validated + clamped exactly like file import. */
export function decodeSharedPreset(param: string): Preset | null {
  try {
    const record: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(param)));
    if (typeof record !== 'object' || record === null) return null;
    const r = record as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '';
    const workSec = Math.round(Number(r.workSec));
    const restSec = Math.round(Number(r.restSec));
    const rounds = Math.round(Number(r.rounds));
    if (!name || !Number.isFinite(workSec) || !Number.isFinite(restSec) || !Number.isFinite(rounds)) {
      return null;
    }
    const id = typeof r.id === 'string' && r.id.length > 0 && !BUILTIN_IDS.has(r.id) ? r.id : uid();
    const steps = r.steps !== undefined ? normalizeSteps(r.steps).steps ?? undefined : undefined;
    const classic = steps
      ? deriveClassicFromSteps(steps)
      : {
          workSec: Math.min(3600, Math.max(5, workSec)),
          restSec: Math.min(3600, Math.max(0, restSec)),
          rounds: Math.min(99, Math.max(1, rounds)),
        };
    return {
      id,
      name,
      ...classic,
      builtin: false,
      ...(steps ? { steps } : {}),
    };
  } catch {
    return null;
  }
}

/** Absolute URL for sharing one preset: `<page>?p=<base64url>`. */
export function buildShareUrl(preset: Preset): string {
  const base = window.location.href.split(/[?#]/)[0];
  return `${base}?p=${encodeSharedPreset(preset)}`;
}
