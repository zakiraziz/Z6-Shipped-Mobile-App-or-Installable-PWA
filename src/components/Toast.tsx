import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';

export type ToastAction = { label: string; onClick: () => void };

export type ToastOptions = {
  /** One optional action — in practice "Undo". */
  action?: ToastAction;
  /** How long it stays up; actions get longer so Undo is reachable. */
  durationMs?: number;
};

type ToastItem = { id: number; message: string; options: ToastOptions };

export type ToastApi = {
  /** Replace whatever is showing with a new message. */
  show: (message: string, options?: ToastOptions) => void;
  dismiss: () => void;
};

const DEFAULT_MS = 3200;
const ACTION_MS = 6500;

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Transient feedback layer. Deliberately tiny: one message at a time (a queue
 * of toasts is a queue nobody reads), an optional single action for the
 * "I didn't mean to do that" case, and it never blocks the screen.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timerRef = useRef(0);
  const idRef = useRef(0);

  const dismiss = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    idRef.current += 1;
    const item: ToastItem = { id: idRef.current, message, options };
    window.clearTimeout(timerRef.current);
    setToast(item);
    timerRef.current = window.setTimeout(
      // Guard on the id so an expired toast can never blank a newer one.
      () => setToast((current) => (current && current.id === item.id ? null : current)),
      options.durationMs ?? (options.action ? ACTION_MS : DEFAULT_MS)
    );
  }, []);

  // Clear the pending timeout if the provider unmounts mid-toast.
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const action = toast.options.action;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 mx-auto w-full max-w-md px-3">
      <div
        role="status"
        aria-live="polite"
        className="animate-toast pointer-events-auto flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/95 px-4 py-3 shadow-xl shadow-black/50 backdrop-blur"
      >
        <p className="min-w-0 flex-1 text-sm text-slate-100">{toast.message}</p>
        {action && (
          <button
            onClick={() => {
              action.onClick();
              onDismiss();
            }}
            className="shrink-0 rounded-full bg-lime-400 px-3 py-1.5 text-xs font-bold text-slate-950 transition active:scale-95"
          >
            {action.label}
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
