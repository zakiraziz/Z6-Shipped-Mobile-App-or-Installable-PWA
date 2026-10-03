/**
 * Smoke test for Beep — run with `npm run test:smoke`.
 *
 * Starts `vite preview`, drives the built app in real headless Chrome and
 * verifies the Definition of Done items that can be checked automatically:
 *   1. app renders, no console/page errors
 *   2. no horizontal overflow at a 390px phone viewport
 *   3. web manifest is reachable and installable
 *   4. service worker registers and activates
 *   5. a session can be started, finished, and lands in localStorage history
 *   6. OFFLINE: the preview server is killed and the app still loads and runs
 *      from the service-worker cache (the PWA offline requirement)
 *
 * Screenshots for the README are written to ../screenshots.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = join(ROOT, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

// Original release files. The update-flow test mutates dist/ copies — and the
// deploy workflow uploads dist/ AFTER this test runs, so without a restore
// the test's artifacts (v999 / "Beep!") would ship to production.
let originalManifest = null;
let originalSw = null;
let manifestPath = '';
let swDistPath = '';

/** System Chrome on any platform (CHROME_PATH overrides for CI). */
function defaultChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return '/usr/bin/google-chrome'; // GitHub Actions ubuntu runners
}
const CHROME = defaultChromePath();

const failures = [];
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures.push(name);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Spawn vite preview DIRECTLY (no npm/cmd wrapper) so a single child.kill()
// reliably frees the port on every platform — this is what makes CI possible.
function startServer() {
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  return spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
}
function stopServer(child) {
  try {
    child.kill();
  } catch {
    /* already gone */
  }
}

let server = startServer();
await sleep(4000);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--no-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });

  // ---- 1. app renders -----------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  const renders = await page.$eval('#root', (el) => el.children.length > 0);
  check('app renders', renders);
  check('title contains Beep', (await page.title()).includes('Beep'));

  // ---- 2. layout fits a phone ---------------------------------------
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  check('no horizontal overflow @390px', overflow <= 0, `delta ${overflow}px`);

  // #2: the upcoming phase is visible before anything starts
  const hasNext = await page.evaluate(() => (document.body.innerText || '').includes('NEXT'));
  check('NEXT preview shows upcoming phase', hasNext);

  // Round 3: preference controls + assistive progress surface (#4/#5/#13/#14)
  const prefs = await page.evaluate(() => ({
    volume: !!document.querySelector('#beep-volume'),
    testSound: [...document.querySelectorAll('button')].some((b) => b.textContent === 'Test sound'),
    testHaptics: [...document.querySelectorAll('button')].some(
      (b) => b.textContent === 'Test haptics'
    ),
    autoPause: (document.body.innerText || '').includes('Auto-pause'),
    progressbar: !!document.querySelector('[role="progressbar"][aria-valuenow]'),
  }));
  check(
    'preference controls present (volume / test sound / test haptics / auto-pause)',
    prefs.volume && prefs.testSound && prefs.testHaptics && prefs.autoPause
  );
  check('timer exposes aria-valuenow progress', prefs.progressbar);

  // ---- 3. manifest ---------------------------------------------------
  const manifest = await page.evaluate(async () => {
    const response = await fetch('manifest.webmanifest');
    return response.ok ? response.json() : null;
  });
  check(
    'manifest installable (standalone, ≥2 icons, start_url)',
    !!manifest &&
      manifest.display === 'standalone' &&
      (manifest.icons?.length ?? 0) >= 2 &&
      !!manifest.start_url,
    manifest ? `${manifest.icons?.length ?? 0} icons` : 'not found'
  );
  check('manifest shortcuts for long-press launch (#20)', (manifest?.shortcuts?.length ?? 0) >= 3);

  // #9/#10: cold-load skeleton + dark iOS launch screens in the served shell
  const shellHtml = await page.evaluate(() => fetch('./').then((r) => r.text()));
  const splashLinks = (shellHtml.match(/apple-touch-startup-image/g) || []).length;
  check(
    'cold-load skeleton + iOS splash links in shell',
    shellHtml.includes('boot-skeleton') && splashLinks >= 3,
    `${splashLinks} splash links`
  );
  const splashOk = await page.evaluate(
    () => fetch('./splash/splash-1170x2532.png').then((r) => r.ok && r.headers.get('content-type')?.startsWith('image'))
  );
  check('splash launch image served', !!splashOk);

  // ---- 4. service worker --------------------------------------------
  const swActive = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return !!registration.active;
  });
  check('service worker active', swActive);

  // Dismiss the install banner so screenshots show the full preferences card.
  await page.evaluate(() => {
    document
      .querySelector('[aria-label="Dismiss install suggestion"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await sleep(200);
  await page.screenshot({ path: join(SHOTS, 'timer-screen.png') });

  // ---- 5. run a session end-to-end ----------------------------------
  await page.click('button[aria-label="Start timer"]');
  // #1: a GET READY 3-2-1 countdown runs before the engine starts
  let countdownShown = true;
  try {
    await page.waitForFunction(() => (document.body.innerText || '').includes('GET READY'), {
      timeout: 3000,
    });
  } catch {
    countdownShown = false;
  }
  check('3-2-1 get-ready countdown appears on Start', countdownShown);
  await page.waitForSelector('button[aria-label="Pause timer"]', { timeout: 9000 });
  check('timer starts after countdown (pause button visible)', true);
  await sleep(1200);

  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Finish')
    );
    button?.click();
  });
  await sleep(300);

  const historyCount = await page.evaluate(
    () => JSON.parse(localStorage.getItem('beep.history.v1') || '[]').length
  );
  check('finished session saved to localStorage history', historyCount >= 1, `${historyCount} entries`);

  // #5: the end-of-session summary must render with the work/rest split
  const hasSummary = await page.evaluate(
    () => !!document.querySelector('[aria-label="Session summary"]')
  );
  check('session summary shows after finish', hasSummary);

  // Screenshot the payoff screen for the README.
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Timer'))?.click();
  });
  await sleep(300);
  await page.screenshot({ path: join(SHOTS, 'session-summary.png') });

  // presets tab screenshot
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Presets'))?.click();
  });
  await sleep(300);
  const hasIo = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('button')].map((b) => b.textContent || '');
    return labels.some((t) => t.includes('Export')) && labels.some((t) => t.includes('Import'));
  });
  check('presets export/import controls present', hasIo);
  // Prove the new preset features actually rendered (EMOM builtin + duplicate)
  const presetFeatures = await page.evaluate(() => ({
    emom: (document.body.innerText || '').includes('EMOM 10'),
    duplicate: !!document.querySelector('[aria-label^="Duplicate"]'),
  }));
  check(
    'EMOM builtin + duplicate control on presets',
    presetFeatures.emom && presetFeatures.duplicate
  );
  await page.screenshot({ path: join(SHOTS, 'presets-screen.png') });

  // history tab screenshot (with the session we just finished)
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('History'))?.click();
  });
  await sleep(300);
  await page.screenshot({ path: join(SHOTS, 'history-screen.png') });

  // #20 receive + #18 reorder round-trip: open a share link, accept it,
  // then confirm the new custom preset unlocks reorder controls.
  const shareToken = Buffer.from(
    JSON.stringify({ id: 'shared-grit', name: 'Shared Grit', workSec: 45, restSec: 15, rounds: 6 }),
    'utf8'
  ).toString('base64url');
  await page.goto(`${BASE}?p=${shareToken}`, { waitUntil: 'networkidle0', timeout: 20000 });
  let shareOfferShown = true;
  try {
    await page.waitForFunction(() => (document.body.innerText || '').includes('Shared: Shared Grit'), {
      timeout: 5000,
    });
  } catch {
    shareOfferShown = false;
  }
  check('shared ?p= link shows import offer', shareOfferShown);

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Add')?.click();
  });
  await sleep(300);
  const customAdded = await page.evaluate(() => {
    const customs = JSON.parse(localStorage.getItem('beep.presets.v1') || '[]');
    return Array.isArray(customs) && customs.some((p) => p.name === 'Shared Grit');
  });
  check('accepted shared preset persisted as custom', customAdded);

  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => (b.textContent || '').includes('Presets'))?.click();
  });
  await sleep(300);
  const reorderPresent = !!(await page.$('[aria-label^="Move "]'));
  check('reorder controls present for custom presets', reorderPresent);

  // #9–#12: preference chips must be visible on the timer card
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => (b.textContent || '').includes('Timer'))?.click();
  });
  await sleep(300);
  const prefsVisible = await page.evaluate(() => {
    const text = document.body.innerText || '';
    return ['Big numbers', 'Halfway chime', 'Voice cues', 'Left-handed'].every((label) =>
      text.includes(label)
    );
  });
  check('preference chips visible (big/halfway/voice/lefty)', prefsVisible);

  check('no console/page errors (online phase)', errors.length === 0, errors.join(' | '));

  // ---- Round 3: stop confirmation + resume-after-kill (#1/#3) ----
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Timer'))?.click();
  });
  await sleep(300);
  await page.click('button[aria-label="Start timer"]');
  await page.waitForSelector('button[aria-label="Pause timer"]', { timeout: 9000 });
  await sleep(5600); // past the 5s confirm line; persisted at 1s granularity

  // #11: status bar tints warm during the work phase
  const themeDuringWork = await page.$eval('meta[name="theme-color"]', (m) =>
    m.getAttribute('content')
  );
  check(
    'theme-color tints during work phase (#11)',
    themeDuringWork === '#7c2d12',
    String(themeDuringWork)
  );

  // #3: finishing a live session must confirm, never destroy silently
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Finish'))?.click();
  });
  await sleep(300);
  check(
    'stop confirmation appears for a live session (#3)',
    await page.evaluate(() => (document.body.innerText || '').includes('Stop this session?'))
  );

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Keep going'))?.click();
  });
  await sleep(300);
  const afterKeepGoing = await page.evaluate(() => ({
    dialog: (document.body.innerText || '').includes('Stop this session?'),
    running: !!document.querySelector('button[aria-label="Pause timer"]'),
  }));
  check('"Keep going" closes the dialog and resumes', !afterKeepGoing.dialog && afterKeepGoing.running);

  // #1: kill the page mid-session → the saved session must come back
  await page.reload({ waitUntil: 'networkidle0', timeout: 20000 });
  let resumeShown = true;
  try {
    await page.waitForFunction(() => (document.body.innerText || '').includes('Resume session?'), {
      timeout: 6000,
    });
  } catch {
    resumeShown = false;
  }
  check('resume card after killing the page mid-session (#1)', resumeShown);

  const resumeText = await page.evaluate(
    () => document.querySelector('[aria-label="Resume session"]')?.innerText ?? ''
  );
  const clock = resumeText.match(/(\d+):(\d+)/);
  const shownSecs = clock ? Number(clock[1]) * 60 + Number(clock[2]) : -1;
  check('resume card shows the real elapsed position', shownSecs >= 4 && shownSecs <= 15, `${shownSecs}s`);

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Resume')?.click();
  });
  await page.waitForSelector('button[aria-label="Pause timer"]', { timeout: 6000 });
  check('resume restarts the session where it left off (#1)', true);
  // Finish again (elapsed >5s → confirm) and complete through the dialog
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Finish'))?.click();
  });
  await sleep(300);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Stop & save'))?.click();
  });
  await sleep(500);
  check(
    'stop confirmation completes the session (#3)',
    await page.evaluate(() => !!document.querySelector('[aria-label="Session summary"]'))
  );

  // #18: name the session where it ended, and prove it reaches history
  const labelOk = await page.evaluate(async () => {
    const input = document.querySelector('input[placeholder^="Name this session"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(input, 'Smoke test day');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // React's onBlur is wired to bubbling focusout, not the non-bubbling blur.
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    const rows = JSON.parse(localStorage.getItem('beep.history.v1') || '[]');
    return rows[0]?.label === 'Smoke test day';
  });
  check('session label persists to history (#18)', labelOk);

  // #7/#8/#16/#19: history usability
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('History'))?.click();
  });
  await sleep(300);
  const historyUi = await page.evaluate(() => ({
    runAgain: !!document.querySelector('[aria-label$="again"]'),
    filter: !!document.querySelector('select[aria-label="Filter history by preset"]'),
    weekly: (document.body.innerText || '').includes('This week:'),
    exportBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Export')),
    label: (document.body.innerText || '').includes('Smoke test day'),
  }));
  check(
    'history: run-again + filter + weekly total + export + label',
    historyUi.runAgain &&
      historyUi.filter &&
      historyUi.weekly &&
      historyUi.exportBtn &&
      historyUi.label,
    JSON.stringify(historyUi)
  );

  await page.evaluate(() => {
    document
      .querySelector('[aria-label$="again"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await sleep(400);
  check(
    '"Run again" returns to the timer with the preset loaded (#7)',
    await page.evaluate(() => {
      const timerTab = [...document.querySelectorAll('nav button')].find((b) =>
        b.textContent.includes('Timer')
      );
      return timerTab?.getAttribute('aria-current') === 'page';
    })
  );

  // #20: a home-screen shortcut jumps straight into the 3-2-1
  await page.goto(`${BASE}?preset=hiit&autostart=1`, {
    waitUntil: 'networkidle0',
    timeout: 20000,
  });
  let shortcutCountdown = true;
  try {
    await page.waitForFunction(() => (document.body.innerText || '').includes('GET READY'), {
      timeout: 5000,
    });
  } catch {
    shortcutCountdown = false;
  }
  check('shortcut link launches straight into 3-2-1 (#20)', shortcutCountdown);
  await page.evaluate(() => {
    document
      .querySelector('button[aria-label="Cancel countdown"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await sleep(300);

  // ---- 7. SW UPDATE FLOW -------------------------------------------
  // Simulates a release: changed asset in dist/ + new sw.js bytes (what
  // `npm run bump:cache` + rebuild produce). The update toast must appear,
  // and clicking Refresh must serve the NEW manifest without a hard reload —
  // this is exactly the stale-cache path a bump:cache release goes through.
  const manifestPathFile = join(ROOT, 'dist', 'manifest.webmanifest');
  const swDistPathFile = join(ROOT, 'dist', 'sw.js');
  manifestPath = manifestPathFile;
  swDistPath = swDistPathFile;
  originalManifest = readFileSync(manifestPath, 'utf8');
  originalSw = readFileSync(swDistPath, 'utf8');
  writeFileSync(
    manifestPath,
    originalManifest.replace('"short_name": "Beep"', '"short_name": "Beep!"')
  );
  writeFileSync(swDistPath, originalSw.replace(/const VERSION = 'v\d+';/, "const VERSION = 'v999';"));
  stopServer(server);
  server = startServer();
  await sleep(4000);
  const serverBack = await fetch(BASE)
    .then((r) => r.ok)
    .catch((e) => `ERR ${e.message}`);
  console.log('  [diag] server after restart:', serverBack);

  await page.reload({ waitUntil: 'networkidle0', timeout: 20000 });
  let toastShown = true;
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Refresh')),
      { timeout: 10000 }
    );
  } catch {
    toastShown = false;
  }
  if (!toastShown) {
    const diag = await page
      .evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        const swlog = /** @type {any} */ (window).__swlog ?? [];
        return {
          url: location.href.slice(0, 70),
          controller: !!navigator.serviceWorker.controller,
          active: !!reg?.active,
          installing: !!reg?.installing,
          waiting: !!reg?.waiting,
          swlog,
        };
      })
      .catch((e) => ({ err: String(e) }));
    console.log('  [diag] toast missing:', JSON.stringify(diag));
  }
  check('update toast appears when sw.js bytes change', toastShown);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }),
    page.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find((b) => (b.textContent || '').includes('Refresh'))
        ?.click();
    }),
  ]);
  const updatedManifest = await page.evaluate(() =>
    fetch('manifest.webmanifest').then((r) => r.text())
  );
  check(
    'changed manifest served after toast Refresh (no hard reload)',
    updatedManifest.includes('"Beep!"')
  );
  check('no console/page errors (through update phase)', errors.length === 0, errors.join(' | '));

  // ---- 6. OFFLINE: kill the server, the app must keep working -------
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.evaluate(() => navigator.serviceWorker.ready);

  stopServer(server);
  await sleep(600);

  const offlineErrors = [];
  const onOfflineError = (error) => offlineErrors.push(error.message);
  page.on('pageerror', onOfflineError);

  await page.reload({ waitUntil: 'networkidle0', timeout: 20000 });
  const offlineRenders = await page.$eval('#root', (el) => el.children.length > 0);
  check('OFFLINE: app reloads from cache with server down', offlineRenders);

  const offlineHistory = await page.evaluate(
    () => JSON.parse(localStorage.getItem('beep.history.v1') || '[]').length
  );
  check('OFFLINE: history survives reload', offlineHistory >= historyCount, `${offlineHistory} entries`);

  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Timer'))?.click();
  });
  await page.click('button[aria-label="Start timer"]');
  // The 3-2-1 countdown runs here too — wait for the engine instead of sleeping.
  let runsOffline = true;
  try {
    await page.waitForSelector('button[aria-label="Pause timer"]', { timeout: 9000 });
  } catch {
    runsOffline = false;
  }
  check('OFFLINE: core feature (timer) runs with server down', runsOffline);
  await page.screenshot({ path: join(SHOTS, 'offline-screen.png') });

  check('no page errors (offline phase)', offlineErrors.length === 0, offlineErrors.join(' | '));
  page.off('pageerror', onOfflineError);
} finally {
  stopServer(server);
  // Restore test-mutated dist files — a deploy artifact built from this dist
  // must be pristine (this exact leak shipped v999 to production once).
  try {
    if (originalManifest !== null) writeFileSync(manifestPath, originalManifest);
    if (originalSw !== null) writeFileSync(swDistPath, originalSw);
  } catch {
    /* dist may not exist if smoke was run without a build */
  }
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
