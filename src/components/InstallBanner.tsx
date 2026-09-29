import { Download, Share, X } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

/**
 * Chromium: native `beforeinstallprompt` → Install button.
 * iOS Safari: no event → Share → Add to Home Screen instructions.
 * Hidden once installed or dismissed for this session.
 */
export function InstallBanner() {
  const { canPrompt, isIOS, installed, dismissed, dismiss, promptInstall } = useInstallPrompt();

  if (installed || dismissed || (!canPrompt && !isIOS)) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[76px] z-30 mx-auto w-full max-w-md px-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-lime-400/30 bg-slate-900/95 p-3 shadow-xl shadow-black/40 backdrop-blur">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-400 text-slate-950">
          <Download size={19} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install Beep</p>
          {canPrompt ? (
            <p className="text-xs text-slate-400">
              Full-screen on your home screen — keeps working offline.
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              Tap <Share size={12} className="inline align-[-1px]" /> Share, then “Add to Home
              Screen”.
            </p>
          )}
        </div>

        {canPrompt && (
          <button
            onClick={() => void promptInstall()}
            className="shrink-0 rounded-full bg-lime-400 px-4 py-2 text-sm font-bold text-slate-950 transition active:scale-95"
          >
            Install
          </button>
        )}

        <button
          onClick={dismiss}
          aria-label="Dismiss install suggestion"
          className="shrink-0 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
