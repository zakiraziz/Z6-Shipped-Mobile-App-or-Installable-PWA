import { useState } from 'react';
import { X } from 'lucide-react';
import { deriveClassicFromSteps } from '../lib/presets';
import type { PresetStep } from '../types';

export type PresetDraft = {
  id: string;
  name: string;
  workSec: number;
  restSec: number;
  rounds: number;
  /** ordered sequence — when set, the classic fields mirror it on save */
  steps?: PresetStep[];
};

type Props = {
  initial: PresetDraft;
  onSave: (draft: PresetDraft) => void;
  onCancel: () => void;
};

function Field({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
        className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-lg outline-none transition focus:border-lime-400"
      />
      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </label>
  );
}

export function PresetForm({ initial, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<PresetDraft>(initial);
  const [error, setError] = useState('');
  /** One form, two shapes: the classic loop or an ordered sequence. */
  const [mode, setMode] = useState<'classic' | 'steps'>(
    initial.steps && initial.steps.length > 0 ? 'steps' : 'classic'
  );
  const [steps, setSteps] = useState<PresetStep[]>(
    initial.steps && initial.steps.length > 0
      ? initial.steps
      : [
          { kind: 'work', seconds: 30 },
          { kind: 'rest', seconds: 15 },
        ]
  );

  const update = (patch: Partial<PresetDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const updateStep = (index: number, patch: Partial<PresetStep>) =>
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  /** Alternate the kind so the next tap of "+ Add step" reads like a flow. */
  const addStep = () =>
    setSteps((current) =>
      current.length >= 60
        ? current
        : [
            ...current,
            {
              kind: current[current.length - 1]?.kind === 'work' ? 'rest' : 'work',
              seconds: 30,
            },
          ]
    );
  const removeStep = (index: number) =>
    setSteps((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));

  const submit = () => {
    const name = draft.name.trim();
    if (!name) return setError('Give the preset a name.');
    if (mode === 'steps') {
      if (steps.length < 1 || steps.length > 60) return setError('A sequence needs 1–60 steps.');
      const bad = steps.find(
        (step) => !Number.isFinite(step.seconds) || step.seconds < 1 || step.seconds > 3600
      );
      if (bad) return setError('Each step must be between 1 and 3600 seconds.');
      const clean = steps.map((step) => ({
        kind: step.kind,
        seconds: Math.round(step.seconds),
        ...(step.label ? { label: step.label } : {}),
      }));
      onSave({ id: draft.id, name, ...deriveClassicFromSteps(clean), steps: clean });
      return;
    }
    if (!Number.isFinite(draft.workSec) || draft.workSec < 5 || draft.workSec > 3600)
      return setError('Work must be between 5 and 3600 seconds.');
    if (!Number.isFinite(draft.restSec) || draft.restSec < 0 || draft.restSec > 3600)
      return setError('Rest must be between 0 and 3600 seconds.');
    if (!Number.isFinite(draft.rounds) || draft.rounds < 1 || draft.rounds > 99)
      return setError('Rounds must be between 1 and 99.');
    onSave({ ...draft, name, steps: undefined });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Preset editor"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-800 bg-slate-900 p-5 pb-8 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Edit preset</h3>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Name</span>
            <input
              type="text"
              value={draft.name}
              maxLength={40}
              placeholder="e.g. Morning circuits"
              onChange={(event) => update({ name: event.target.value })}
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-base outline-none transition focus:border-lime-400"
            />
          </label>

          {/* one form, two shapes */}
          <div
            role="group"
            aria-label="Preset shape"
            className="flex rounded-full border border-slate-700 p-1"
          >
            <button
              type="button"
              onClick={() => setMode('classic')}
              aria-label="Classic rounds mode"
              aria-pressed={mode === 'classic'}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                mode === 'classic' ? 'bg-lime-400 text-slate-950' : 'text-slate-400'
              }`}
            >
              Classic rounds
            </button>
            <button
              type="button"
              onClick={() => setMode('steps')}
              aria-label="Step sequence mode"
              aria-pressed={mode === 'steps'}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                mode === 'steps' ? 'bg-lime-400 text-slate-950' : 'text-slate-400'
              }`}
            >
              Step sequence
            </button>
          </div>

          {mode === 'classic' ? (
            <div className="grid grid-cols-3 gap-3">
              <Field
                label="Work"
                hint="seconds"
                value={draft.workSec}
                min={5}
                max={3600}
                onChange={(workSec) => update({ workSec })}
              />
              <Field
                label="Rest"
                hint="seconds"
                value={draft.restSec}
                min={0}
                max={3600}
                onChange={(restSec) => update({ restSec })}
              />
              <Field
                label="Rounds"
                hint="1–99"
                value={draft.rounds}
                min={1}
                max={99}
                onChange={(rounds) => update({ rounds })}
              />
            </div>
          ) : (
            <div>
              <ul aria-label="Step list" className="space-y-2">
                {steps.map((step, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateStep(index, { kind: step.kind === 'work' ? 'rest' : 'work' })}
                      aria-label={`Step ${index + 1} kind: ${step.kind} — switch`}
                      className={`w-16 shrink-0 rounded-full border px-2 py-1.5 text-xs font-bold transition active:scale-95 ${
                        step.kind === 'work'
                          ? 'border-lime-400/40 bg-lime-400/15 text-lime-300'
                          : 'border-sky-400/40 bg-sky-400/10 text-sky-300'
                      }`}
                    >
                      {step.kind === 'work' ? 'Work' : 'Rest'}
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={3600}
                      value={Number.isFinite(step.seconds) ? step.seconds : ''}
                      aria-label={`Step ${index + 1} seconds`}
                      onChange={(event) =>
                        updateStep(index, { seconds: Number.parseInt(event.target.value, 10) })
                      }
                      className="w-20 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm outline-none transition focus:border-lime-400"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                      {step.label ?? ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      aria-label={`Remove step ${index + 1}`}
                      disabled={steps.length <= 1}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:text-rose-400 disabled:opacity-30"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={addStep}
                aria-label="Add step"
                className="mt-2 w-full rounded-xl border border-dashed border-slate-700 py-2 text-xs font-medium text-slate-400 transition hover:border-lime-400/60 hover:text-lime-300 active:scale-95"
              >
                + Add step
              </button>
            </div>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-slate-700 py-3 text-sm font-semibold text-slate-300 transition active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="flex-1 rounded-full bg-lime-400 py-3 text-sm font-bold text-slate-950 transition active:scale-95"
          >
            Save preset
          </button>
        </div>
      </div>
    </div>
  );
}
