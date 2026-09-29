# Z6 · Shipped Mobile App or Installable PWA — **Beep**

[![Deploy to GitHub Pages](https://github.com/zakiraziz/Z6-Shipped-Mobile-App-or-Installable-PWA/actions/workflows/deploy.yml/badge.svg)](https://github.com/zakiraziz/Z6-Shipped-Mobile-App-or-Installable-PWA/actions/workflows/deploy.yml)

**Live installable PWA → https://zakiraziz.github.io/Z6-Shipped-Mobile-App-or-Installable-PWA/**

> An offline-first **interval timer** for HIIT, boxing rounds, sprints and Pomodoro — a focused tool, not a clone. It installs on a phone like a real app and keeps working with **zero connection**: no backend, no account, no third-party APIs.

![Beep – timer screen](./screenshots/timer-screen.png)

**Brief:** New platform · 28–32h over 4–5 weeks · Prerequisite: React
**Path chosen:** installable **PWA** (service worker) instead of React Native/Expo — the brief itself says *"a PWA is the easier path if you already know web"*, and one codebase installs on every phone.

---

## Why this idea
- **Focused and useful:** one job — precise work/rest intervals — done properly (progress ring, round counter, cues, history).
- **Offline is the core feature, not a checkbox:** the entire app is client-side. Presets and history live in `localStorage`, beeps are synthesised with Web Audio (no audio files), the shell is precached by a hand-written service worker.
- **Uses real device features:** Wake Lock (screen stays on while a session runs), Vibration API cues, `beforeinstallprompt` / Add-to-Home-Screen, full-screen standalone display.

## Features

**Core**
- Interval engine: work/rest segments, round counter, ring + total progress, pause / resume / skip / reset / finish
- 5 built-in presets (Tabata, HIIT 45/15, Boxing rounds, Pomodoro, Sprint 30/90) + create / edit / delete custom presets
- Session history with stats (sessions, this week, total time) — stored on the device
- Countdown beeps for 3/2/1, a distinct cue on every phase change, a finish fanfare — all Web Audio
- Vibration patterns (Android) plus sound / vibration toggles in the header
- "Offline" pill appears the moment the network drops

**Installable PWA**
- Web app manifest + generated icon set (any + maskable) + standalone display
- Hand-written service worker: network-first HTML, cache-first assets, runtime caching, versioned cache cleanup
- Update toast ("New version available → Refresh") when a new build is published
- Install banner: native **Install** button on Chromium, Share → Add to Home Screen instructions on iOS Safari

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

## Definition of Done

- [x] **Installable on a real device** — manifest + icons + service worker verified by `npm run test:smoke` (standalone display, 3 icons, active SW, native install prompt in Chrome)
- [x] **Core feature works offline (PWA)** — verified by an automated test that **kills the preview server**, reloads the app from the service-worker cache and runs a timer on it
- [x] **Published** — GitHub Pages; every push to `main` redeploys via GitHub Actions
- [ ] **Tested on at least one real device** — 👉 *your turn: 5 minutes with Option A above, then tick this box*

## Publish / re-deploy

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
First time only: repo **Settings → Pages → Source: GitHub Actions**.
Any other static host works too — the build uses a relative base (`base: './'`), so `dist/` can be dropped into any sub-folder (Netlify, Vercel, Surge…).

## Project structure

```
├─ index.html                # PWA meta, manifest link, iOS tags
├─ public/
│  ├─ sw.js                  # hand-written service worker
│  ├─ manifest.webmanifest   # install metadata
│  └─ icons/                 # 192 / 512 / maskable / apple-touch (rendered from tools/icon.html)
├─ src/
│  ├─ App.tsx                # shell: tabs, wake lock, install/update banners
│  ├─ state.tsx              # persistent state + timer wiring (React context)
│  ├─ hooks/useIntervalTimer.ts  # timestamp-based engine with beep/vibration edge detection
│  ├─ hooks/…                # wake lock, install prompt, online status, localStorage
│  ├─ lib/                   # presets, Web Audio cues, formatting
│  └─ components/            # Timer, Presets, History, Header, TabBar, banners
├─ scripts/smoke.mjs         # headless-Chrome end-to-end + offline test
├─ tools/icon.html           # source of the PNG app icons
└─ .github/workflows/deploy.yml
```

## Automated checks — `npm run test:smoke`

12 checks in real headless Chrome: app renders · zero console/page errors · no horizontal overflow at 390 px · manifest installable · service worker active · start + finish a session · history persisted to `localStorage` · **server killed → app reloads from cache → timer still runs** · and it regenerates the screenshots above.

## If you get stuck

- **Blank page on the phone?** Same Wi-Fi + `--host`, and use the HTTPS link for anything involving the service worker.
- **SW feels stale?** DevTools → Application → Service Workers → Unregister (normally the update toast handles it).
- **Push notifications (stretch):** add `push` / `notificationclick` handlers in `public/sw.js` + `Notification.requestPermission()` — the scaffolding is already there.
- **App-store (stretch):** wrap this same PWA with [PWABuilder](https://www.pwabuilder.com) for a Play Store listing.

---

Built for **Z6** — from React on a screen to software that lives on a phone. 📱
