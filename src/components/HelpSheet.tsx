import { useEffect, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * In-app manual: keyboard shortcuts for hardware keyboards plus the handful
 * of tips that make the app make sense on first open. Reachable from the
 * header (?) button and the `?` key so it is never a mystery.
 */
const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Start · pause · resume (again cancels the 3-2-1; drives the stopwatch in Stopwatch mode)' },
  { keys: 'S', action: 'Skip to the next segment' },
  { keys: 'R', action: 'Reset the timer' },
  { keys: '?', action: 'Open and close this help' },
  { keys: 'Esc', action: 'Close this sheet or a confirmation' },
];

const TIPS: string[] = [
  'Tap the ring itself to start or pause — no precision needed with sweaty thumbs.',
  'NEXT under the ring shows what is coming, so you can prepare for the switch.',
  'Pick your cue sound (Beep / Chime / Click) and get-ready length (Off · 3 · 5 · 10s) in the timer preferences.',
  'Moving to a new phone? Presets → Full backup saves presets, history and settings in one file.',
  'Install Beep from your browser menu for a full-screen app that works offline.',
  'Lock-screen cues need notification permission — asked once, on your first Start.',
  'Left-handed? Big numbers? Those live with the preferences on the timer screen.',
];

export function HelpSheet({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  /** Element that had focus before opening, so closing puts it back. */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      // `?` closes as well as opens — the global handler is muted while a
      // dialog owns the keyboard, so this listener is the close path.
      if (event.key === 'Escape' || event.key === '?') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-toast max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="help-title" className="text-lg font-bold">
              Help &amp; shortcuts
            </h2>
            <p className="text-xs text-slate-400">Everything runs on this device.</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close help"
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <section className="mt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Keyboard size={13} /> Keyboard shortcuts
          </h3>
          <dl className="mt-2 space-y-1.5">
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.keys}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
              >
                <dt className="min-w-[52px] shrink-0">
                  <kbd className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-200">
                    {shortcut.keys}
                  </kbd>
                </dt>
                <dd className="text-xs leading-relaxed text-slate-400">{shortcut.action}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-slate-500">
            Shortcuts need a hardware keyboard — on a phone, just tap the buttons.
          </p>
        </section>

        <section className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Quick tips</h3>
          <ul className="mt-2 space-y-2">
            {TIPS.map((tip) => (
              <li
                key={tip}
                className="flex gap-2 text-xs leading-relaxed text-slate-400"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400/80" aria-hidden="true" />
                {tip}
              </li>
            ))}
          </ul>
        </section>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-lime-400 py-2.5 text-sm font-bold text-slate-950 transition active:scale-95"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
