import { useState } from 'react';
import { X } from 'lucide-react';

export type PresetDraft = {
  id: string;
  name: string;
  workSec: number;
  restSec: number;
  rounds: number;
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

  const update = (patch: Partial<PresetDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = () => {
    const name = draft.name.trim();
    if (!name) return setError('Give the preset a name.');
    if (!Number.isFinite(draft.workSec) || draft.workSec < 5 || draft.workSec > 3600)
      return setError('Work must be between 5 and 3600 seconds.');
    if (!Number.isFinite(draft.restSec) || draft.restSec < 0 || draft.restSec > 3600)
      return setError('Rest must be between 0 and 3600 seconds.');
    if (!Number.isFinite(draft.rounds) || draft.rounds < 1 || draft.rounds > 99)
      return setError('Rounds must be between 1 and 99.');
    onSave({ ...draft, name });
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
