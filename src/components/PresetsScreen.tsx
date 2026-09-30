import { useRef, useState, type ChangeEvent } from 'react';
import { Check, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { presetSummary, presetTotalMs } from '../lib/presets';
import { parsePresetFile, serializePresets } from '../lib/presets-io';
import { formatClock, uid } from '../lib/format';
import { useAppState } from '../state';
import { PresetForm, type PresetDraft } from './PresetForm';

export function PresetsScreen() {
  const { presets, activePreset, selectPreset, savePreset, deletePreset } = useAppState();
  const [editing, setEditing] = useState<PresetDraft | null>(null);
  const [ioStatus, setIoStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openNew = () =>
    setEditing({ id: uid(), name: '', workSec: 30, restSec: 15, rounds: 8 });

  const openEdit = (id: string, name: string, workSec: number, restSec: number, rounds: number) =>
    setEditing({ id, name, workSec, restSec, rounds });

  const customPresets = presets.filter((preset) => !preset.builtin);

  const handleExport = () => {
    if (customPresets.length === 0) {
      setIoStatus('No custom presets yet — create one first.');
      return;
    }
    const blob = new Blob([serializePresets(customPresets)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `beep-presets-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setIoStatus(`Exported ${customPresets.length} preset${customPresets.length === 1 ? '' : 's'}.`);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    try {
      const result = parsePresetFile(await file.text());
      if (!result.ok) {
        setIoStatus(`Import failed: ${result.error}.`);
        return;
      }
      result.imported.forEach(savePreset);
      // Surface skips and unknown fields — never drop entries silently.
      const notes =
        result.notes.length > 0
          ? ` — ${result.notes.slice(0, 2).join('; ')}${result.notes.length > 2 ? '…' : ''}`
          : '';
      setIoStatus(
        `Imported ${result.imported.length}${
          result.skipped ? ` (skipped ${result.skipped})` : ''
        }${notes}.`
      );
    } catch {
      setIoStatus('Could not read that file.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Presets</h2>
          <p className="text-xs text-slate-400">
            Tap one to make it active — custom presets stay on this device.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime-400 px-3.5 py-2 text-sm font-semibold text-slate-950 transition active:scale-95"
        >
          <Plus size={16} /> New
        </button>
      </div>

      <div className="space-y-3">
        {presets.map((preset) => {
          const isActive = preset.id === activePreset.id;
          return (
            <div
              key={preset.id}
              className={`rounded-2xl border p-4 transition ${
                isActive
                  ? 'border-lime-400/60 bg-lime-400/5'
                  : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => selectPreset(preset.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{preset.name}</span>
                    {isActive && (
                      <span className="rounded-full bg-lime-400/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-lime-300">
                        ACTIVE
                      </span>
                    )}
                    {!preset.builtin && (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                        custom
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {presetSummary(preset)} · {formatClock(presetTotalMs(preset))} total
                  </p>
                </button>

                <div className="flex shrink-0 items-center gap-0.5">
                  {isActive && <Check size={16} className="mr-1 text-lime-300" />}
                  {!preset.builtin && (
                    <>
                      <button
                        onClick={() =>
                          openEdit(preset.id, preset.name, preset.workSec, preset.restSec, preset.rounds)
                        }
                        aria-label={`Edit ${preset.name}`}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => deletePreset(preset.id)}
                        aria-label={`Delete ${preset.name}`}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-rose-400"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* share / backup: custom presets as a JSON file */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 active:scale-95"
          >
            <Download size={13} /> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 active:scale-95"
          >
            <Upload size={13} /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
        <span className="text-xs text-slate-500" role="status">
          {ioStatus}
        </span>
      </div>

      {editing && (
        <PresetForm
          initial={editing}
          onSave={(draft) => {
            savePreset({ ...draft, builtin: false });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
