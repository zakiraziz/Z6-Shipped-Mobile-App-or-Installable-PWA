/**
 * Local notifications for backgrounded/locked sessions — no push server.
 *
 * Permission is requested ONCE, from the first Start tap (browsers require a
 * gesture, and asking in context has a far higher grant rate than asking on
 * page load). The choice is remembered — we never nag again.
 */
const ASKED_KEY = 'beep.notify.asked';
const CUE_TAG = 'beep-timer';

type CueOptions = { title: string; body: string; vibrate?: number[] };

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function readAsked(): boolean {
  try {
    return window.localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return true; // storage blocked → treat as asked, don't risk nagging
  }
}

function markAsked(): void {
  try {
    window.localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Call from a user gesture (first Start tap). Safe to call on every start. */
export async function requestNotifyPermissionOnce(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') {
    markAsked();
    return Notification.permission;
  }
  if (readAsked()) return Notification.permission;
  markAsked();
  try {
    const result = await Promise.race([
      Notification.requestPermission(),
      new Promise<NotificationPermission | undefined>((resolve) =>
        window.setTimeout(resolve, 2000)
      ),
    ]);
    return typeof result === 'string' ? result : Notification.permission;
  } catch {
    /* browser refused — sound/vibration remain as cues */
    return Notification.permission;
  }
}

/** Current permission state — drives the "notifications off" hint in the UI. */
export function getNotificationState(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

function assetUrl(path: string): string {
  try {
    return new URL(path, window.location.href).href;
  } catch {
    return path;
  }
}

/**
 * Show the persistent cue notification. `tag` + `renotify` mean each phase
 * REPLACES the previous one — there is never more than one cue on screen.
 */
export async function showCueNotification(options: CueOptions): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const payload = {
    tag: CUE_TAG,
    renotify: true,
    requireInteraction: true,
    vibrate: options.vibrate,
    icon: assetUrl('icons/icon-192.png'),
    badge: assetUrl('icons/icon-192.png'),
    // Explicit absolute target for notificationclick: some Android builds open
    // a blank SW context when openWindow() only gets a bare relative path.
    data: { url: assetUrl('./') },
    body: options.body,
  } as NotificationOptions & { renotify: boolean; data: { url: string } };

  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(resolve, 2000)),
    ]);
    if (registration) {
      await registration.showNotification(options.title, payload);
    } else {
      // Dev server has no SW — direct constructor works on desktop/Android.
      new Notification(options.title, payload);
    }
  } catch {
    /* notifications unavailable here — sound/vibration already fired */
  }
}

/** Close any lingering cue (called when the app comes back to the foreground). */
export function clearCueNotifications(): void {
  if (!notificationsSupported()) return;
  try {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map((registration) =>
            registration
              .getNotifications({ tag: CUE_TAG })
              .then((list) => list.forEach((notification) => notification.close()))
          )
        )
      )
      .catch(() => undefined);
  } catch {
    /* ignore */
  }
}
