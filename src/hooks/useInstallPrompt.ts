import { useCallback, useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isAppleTouchDevice(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac but has a touchscreen
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * Chrome/Edge fire `beforeinstallprompt` (→ native Install button);
 * iOS Safari has no such event, so we detect it and show Share →
 * Add to Home Screen instructions instead.
 *
 * Dismissal is remembered PER SESSION: the banner hides for the session it
 * was dismissed in, then re-offers after REOFFER_AFTER sessions — persistent
 * but not nagging.
 */
const SESSIONS_KEY = 'beep.install.sessions';
const DISMISSED_KEY = 'beep.install.dismissed-at';
const REOFFER_AFTER = 5;

function bumpSession(): number {
  try {
    const next = Number(window.localStorage.getItem(SESSIONS_KEY) ?? '0') + 1;
    window.localStorage.setItem(SESSIONS_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

function readDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [session] = useState(bumpSession);
  const [dismissedAt, setDismissedAt] = useState<number | null>(readDismissedAt);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') setDeferred(null);
    return choice.outcome;
  }, [deferred]);

  const dismissed = dismissedAt !== null && session - dismissedAt < REOFFER_AFTER;

  const dismiss = useCallback(() => {
    setDismissedAt(session);
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(session));
    } catch {
      /* ignore */
    }
  }, [session]);

  return {
    canPrompt: deferred !== null,
    isIOS: isAppleTouchDevice(),
    installed,
    dismissed,
    dismiss,
    promptInstall,
  };
}
