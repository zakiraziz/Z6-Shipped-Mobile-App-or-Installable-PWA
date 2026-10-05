import { useEffect } from 'react';

export type ShortcutHandlers = {
  /** Space — start / pause / resume (and cancel the 3-2-1). */
  onPrimary?: () => void;
  /** S — skip the current segment. */
  onSkip?: () => void;
  /** R — reset back to idle. */
  onReset?: () => void;
  /** ? — open the help sheet. */
  onToggleHelp?: () => void;
};

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') return false;
  return TYPING_TAGS.has(element.tagName) || element.isContentEditable === true;
}

/** Native controls already own Space/Enter — never double-fire them. */
function isInteractive(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (!element || typeof element.closest !== 'function') return false;
  return Boolean(element.closest('button, a, [role="button"], [role="link"], select, summary'));
}

/**
 * Hardware-keyboard shortcuts. Deliberately conservative: it never fires while
 * the user is typing, never fires for a key the focused control handles itself,
 * and steps aside completely while a modal dialog owns the keyboard.
 *
 * Callers pass only the handlers they own, so the shell can bind `?` and the
 * timer screen can bind Space/S/R without either knowing about the other.
 */
export function useShortcuts({
  onPrimary,
  onSkip,
  onReset,
  onToggleHelp,
}: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      if (event.key === '?') {
        if (!onToggleHelp) return;
        event.preventDefault();
        onToggleHelp();
        return;
      }

      // A dialog (help sheet, stop confirmation) owns the keyboard.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (isInteractive(event.target)) return;

      if (event.key === ' ') {
        if (!onPrimary) return;
        event.preventDefault(); // Space would otherwise scroll the page
        onPrimary();
        return;
      }
      if (event.key === 's' || event.key === 'S') onSkip?.();
      else if (event.key === 'r' || event.key === 'R') onReset?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPrimary, onSkip, onReset, onToggleHelp]);
}
