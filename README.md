# Z6 · Shipped Mobile App or Installable PWA — **Beep**

[![Deploy to GitHub Pages](https://github.com/zakiraziz/Z6-Shipped-Mobile-App-or-Installable-PWA/actions/workflows/deploy.yml/badge.svg)](https://github.com/zakiraziz/Z6-Shipped-Mobile-App-or-Installable-PWA/actions/workflows/deploy.yml)
[![CI](https://github.com/zakiraziz/Z6-Shipped-Mobile-App-or-Installable-PWA/actions/workflows/ci.yml/badge.svg)](https://github.com/zakiraziz/Z6-Shipped-Mobile-App-or-Installable-PWA/actions/workflows/ci.yml)

**Live installable PWA → https://zakiraziz.github.io/Z6-Shipped-Mobile-App-or-Installable-PWA/**

> An offline-first **interval timer** for HIIT, boxing rounds, sprints and Pomodoro — a focused tool, not a clone. It installs on a phone like a real app and keeps working with **zero connection**: no backend, no account, no third-party APIs.

![Beep – timer screen](./screenshots/timer-screen.png)

**Brief:** New platform · 28–32h over 4–5 weeks · Prerequisite: React
**Path chosen:** installable **PWA** (service worker) instead of React Native/Expo — the brief itself says *"a PWA is the easier path if you already know web"*, and one codebase installs on every phone.

---

## Why this idea
- **Focused and useful:** one job — precise work/rest intervals — done properly (progress ring, round counter, cues, history).
- **Offline is the core feature, not a checkbox:** the entire app is client-side. Presets and history live in `localStorage`, beeps are synthesised with Web Audio (no audio files), the shell is precached by a hand-written service worker.
- **Uses real device features:** Wake Lock (screen stays on while a session runs), Web Notifications for locked-screen cues, Vibration API cues, `beforeinstallprompt` / Add-to-Home-Screen, full-screen standalone display.

## Features

**Core**
- Interval engine: work/rest segments, round counter, ring + total progress, pause / resume / skip / reset / finish
- **Background cues that can't be missed:** when the screen isn't visible, every phase change and the finish fire a persistent service-worker notification (`requireInteraction`, `tag` + `renotify` → exactly one cue at a time, replaced per phase). Permission is requested once, on the first Start tap — never nags.
- **Drift-free catch-up scheduler:** the engine runs on absolute timestamps with a plain interval (rAF stops entirely when backgrounded) and *replays every boundary crossed* — after the OS throttles a slept phone, cues fire with a "N phases passed" summary instead of vanishing silently
- 5 built-in presets (Tabata, HIIT 45/15, Boxing rounds, Pomodoro, Sprint 30/90) + create / edit / delete custom presets
- **Presets export/import as JSON** — share workouts, back up, move them between devices (import validates + clamps every field)
- Session history with stats (sessions, this week, total time) — stored on the device (`localStorage`, `navigator.storage.persist()` requested so it survives storage pressure)
- Countdown beeps for 3/2/1, a distinct Web Audio fanfare per phase, and **distinct haptics per phase** (work = 3 short pulses, rest = 1 long) plus sound / vibration toggles in the header
- Screen-reader announcements on every phase/status change (`aria-live="assertive"`)
- "Offline" pill appears the moment the network drops

**Installable PWA**
- Web app manifest (`display_override`, stable `id`) + generated icon set (any + maskable) + standalone display
- Hand-written service worker: network-first HTML, cache-first assets, runtime caching, versioned cache cleanup (`npm run bump:cache`), and `notificationclick` → focuses the open app
- Update toast ("New version available → Refresh") when a new build is published
- Install banner: native **Install** button on Chromium, Share → Add to Home Screen on iOS — dismissal is remembered and the banner re-offers after 5 sessions
- `prefers-reduced-motion` + `prefers-contrast` support, and a `404.html` SPA insurance redirect for GitHub Pages

> **The claim this version makes:** _"Beep reliably cues you even when your phone is locked in your pocket — via Web Notifications with `requireInteraction` and a drift-free absolute-time scheduler that catches up on missed phase boundaries after the OS throttles a backgrounded tab."_
>
> Honest limits: cues while the screen is off are best-effort — Android throttles background timers to ~1 Hz (and roughly once a minute after long idle), so a notification can lag by up to a minute in deep sleep. The timestamp math means the *timer itself* is never wrong. iOS delivers notifications only for the **installed** app (iOS ≥ 16.4).

## Screenshots

| Timer | Presets | History |
| --- | --- | --- |
| ![Timer](./screenshots/timer-screen.png) | ![Presets](./screenshots/presets-screen.png) | ![History](./screenshots/history-screen.png) |

| Core feature with the server switched **off** |
| --- |
| ![Offline](./screenshots/offline-screen.png) |

---

## Tech stack
React 18 · TypeScript · Vite 6 · Tailwind CSS 3 · lucide-react · hand-written service worker — **no backend**, data stays on the device (`localStorage`).

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build → dist/
npm run preview      # serve dist/ locally
npm run test:smoke   # automated end-to-end + offline checks (needs Chrome)
```

---

## Test it on a real phone (a requirement of the brief)

**Option A — from the published link (easiest):** open the live URL on your phone, install it (table below), then switch on airplane mode and reopen it from the home screen.

**Option B — from your laptop while building (same Wi-Fi):**

```bash
npm run dev -- --host
# open the printed http://192.168.x.x:5173 URL on your phone
```

> Service workers require a secure context — `localhost` and the HTTPS GitHub Pages link qualify, a plain `http://LAN-IP` does not. So Option B is for UI testing; run the **offline** test against the published link.

**Install it:**

| Platform | Steps |
| --- | --- |
| Android (Chrome) | ⋮ menu → **Add to Home screen** / **Install app** |
| iPhone / iPad (Safari) | Share → **Add to Home Screen** |
| Desktop (Chrome / Edge) | install icon at the right of the address bar |

**Offline test:** airplane mode on → launch from the home screen → run a session → open History. Everything still works.

**Background-cue test (the important one):** start a session → lock the phone or switch apps → at the next phase change you should get a notification ("Work complete — Rest 0:10 — round 3/8") that stays until tapped; tapping it opens Beep. On iOS this works only in the installed app (≥ 16.4).

## Definition of Done

- [x] **Installable on a real device** — manifest + icons + service worker verified by `npm run test:smoke` (standalone display, 3 icons, active SW, native install prompt in Chrome)
- [x] **Core feature works offline (PWA)** — verified by an automated test that **kills the preview server**, reloads the app from the service-worker cache and runs a timer on it
- [x] **Published** — GitHub Pages; every push to `main` redeploys via GitHub Actions
- [ ] **Tested on at least one real device** — 👉 *your turn: 5 minutes with Option A above, then tick this box*

## Publish / re-deploy

`.github/workflows/deploy.yml` builds, runs the full smoke test (a failing test **blocks the deploy**) and deploys on every push to `main`; `.github/workflows/ci.yml` runs the same test on every push/PR and uploads the screenshots as artifacts.
First time only: repo **Settings → Pages → Source: GitHub Actions**.
Any other static host works too — the build uses a relative base (`base: './'`), so `dist/` can be dropped into any sub-folder (Netlify, Vercel, Surge…).

## Project structure

```
├─ index.html                # PWA meta, manifest link, iOS tags
├─ public/
│  ├─ sw.js                  # SW: caching + notificationclick (hand-written)
│  ├─ manifest.webmanifest   # install metadata
│  ├─ 404.html               # GitHub Pages → app root redirect
│  └─ icons/                 # 192 / 512 / maskable / apple-touch (rendered from tools/icon.html)
├─ src/
│  ├─ App.tsx                # shell: tabs, wake lock, storage.persist, visibility handling
│  ├─ state.tsx              # persistent state + timer wiring (React context)
│  ├─ hooks/useIntervalTimer.ts  # interval + timestamp engine, replays crossed boundaries
│  ├─ hooks/…                # wake lock, install prompt, online status, localStorage
│  ├─ lib/cues.ts            # sound + haptics + notifications, one dispatcher per phase
│  ├─ lib/notify.ts          # permission flow (ask once), SW notifications, cleanup
│  ├─ lib/sound.ts           # Web Audio cues + iOS unlock / resume
│  ├─ lib/presets-io.ts      # preset JSON export/import (validated + clamped)
│  └─ components/            # Timer, Presets, History, Header, TabBar, banners
├─ scripts/smoke.mjs         # headless-Chrome end-to-end + offline test (cross-platform)
├─ scripts/bump-cache.mjs    # npm run bump:cache → sw.js cache version++
├─ tools/icon.html           # source of the PNG app icons
└─ .github/workflows/        # deploy.yml (test-then-deploy) + ci.yml (test on push/PR)
```

## Automated checks — `npm run test:smoke`

13 checks in real headless Chrome: app renders · zero console/page errors · no horizontal overflow at 390 px · manifest installable · service worker active · start + finish a session (this also exercises the notification-permission flow) · history persisted to `localStorage` · export/import controls present · **server killed → app reloads from cache → timer still runs** · and it regenerates the screenshots above.

The same test runs on every push/PR in **GitHub Actions** (`.github/workflows/ci.yml`, screenshots uploaded as artifacts) and gates the Pages deploy.

> **Deliberate non-goals:** no Lighthouse CI — the PWA audit category was removed in Lighthouse 12 and perf scores on shared runners are flaky, so the smoke test asserts installability/offline behaviour directly instead. No Playwright either: the puppeteer-core harness covers the same ground with zero extra dependencies. Chrome is resolved per platform (`CHROME_PATH` env overrides) rather than version-pinned.

## If you get stuck

- **Blank page on the phone?** Same Wi-Fi + `--host`, and use the HTTPS link for anything involving the service worker.
- **No notification appears?** Permission is asked on the first Start tap (check the site's notification settings); Android must not have the app force-stopped; iOS requires the *installed* app (≥ 16.4). `notificationclick` is already wired in `sw.js`.
- **SW cache feels stale?** DevTools → Application → Service Workers → Unregister (normally the update toast handles it), or run `npm run bump:cache` before releasing icon/manifest changes.
- **Remote push (stretch):** the local cue system needs no server; true remote push would add a `push` handler in `public/sw.js` plus a push-service subscription in `lib/notify.ts`.
- **App-store (stretch):** wrap this same PWA with [PWABuilder](https://www.pwabuilder.com) for a Play Store listing.

---

Built for **Z6** — from React on a screen to software that lives on a phone. 📱
