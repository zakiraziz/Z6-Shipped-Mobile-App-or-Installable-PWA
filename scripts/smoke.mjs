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
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * The backup round-trip downloads a file into node_modules/.beep-backup-dl.
 * Chrome can keep the handle open for a beat after the run, and a Windows
 * EPERM must not leak into an otherwise green suite — so delete with retries
 * and say so loudly if the file genuinely refuses to go.
 */
async function removeScratchDir(dir) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await sleep(250);
    }
  }
  console.log(`  note: scratch dir still locked, could not remove: ${dir}`);
}

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

  // ---- 2b. the preset rail is honestly scrollable ---------------------
  // Regression: the rail carried `no-scrollbar`, hiding every affordance, so
  // chips past the right edge read as clipped rather than scrollable. Seeded
  // with enough presets to force REAL overflow at 390px — otherwise this
  // passes on a viewport wide enough for the default three, which is the
  // "it passed on luck" failure mode.
  await page.evaluate(() => {
    localStorage.setItem(
      'beep.presets.v1',
      JSON.stringify(
        Array.from({ length: 14 }, (_, i) => ({
          id: `rail${i}`,
          name: `Rail preset number ${i + 1}`,
          workSec: 30,
          restSec: 10,
          rounds: 4,
          builtin: false,
        }))
      )
    );
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  const rail = await page.evaluate(() => {
    // Derive the rail from a seeded chip's PARENT rather than a styling class,
    // so this stays valid if the class names change. Both the old and new
    // markup put the scrollable container directly around the chips.
    const chip = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').startsWith('Rail preset number 1')
    );
    const el = chip ? chip.parentElement : null;
    if (!el) return { found: false };
    const before = el.scrollLeft;
    el.scrollLeft = 9999;
    return {
      found: true,
      overflows: el.scrollWidth - el.clientWidth > 4,
      scrolled: el.scrollLeft > before,
      barWidth: getComputedStyle(el).scrollbarWidth,
      fadeShown: Boolean(el.parentElement.querySelector('[aria-hidden="true"]')),
    };
  });
  check('preset rail overflows @390px (seeded, not lucky)', rail.found && rail.overflows);
  check('preset rail actually scrolls horizontally', rail.found && rail.scrolled);
  check('preset rail keeps a visible scrollbar', rail.found && rail.barWidth !== 'none', `scrollbar-width: ${rail.barWidth}`);
  check('preset rail signals "more to the right"', rail.found && rail.fadeShown);
  // Drop the seeded presets so later checks see a normal set.
  await page.evaluate(() => localStorage.removeItem('beep.presets.v1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(200);

  // #2: the upcoming phase is visible before anything starts
  const hasNext = await page.evaluate(() => (document.body.innerText || '').includes('NEXT'));
  check('NEXT preview shows upcoming phase [claim:next-preview]', hasNext);

  // #3: the ring itself is the tap target — a big hit area, not a small icon.
  // Asserted on the DOM, not by eyeballing a screenshot: the vision channel
  // already lied once (stale screenshots), so size claims get measured.
  const ring = await page.evaluate(() => {
    const el = document.querySelector('[role="button"][aria-label="Start timer"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), clickable: getComputedStyle(el).cursor };
  });
  check(
    'the ring itself is a large tap target (≥200px, pointer cursor) [claim:ring-tap]',
    !!ring && ring.w >= 200 && ring.h >= 200 && ring.clickable === 'pointer',
    ring ? `${ring.w}×${ring.h}px cursor:${ring.clickable}` : 'not found'
  );

  // Reduced-motion must actually neutralise transitions — asserting only that
  // the media query exists would pass even if the CSS block were deleted.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const reducedMotion = await page.evaluate(() => {
    const ring = document.querySelector('div[role="button"]');
    return {
      matches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      duration: ring ? getComputedStyle(ring).transitionDuration : null,
    };
  });
  check(
    'prefers-reduced-motion neutralises transitions [claim:a11y-media]',
    // Chrome serialises 0.01ms as "1e-05s" — compare numerically, never by string.
    reducedMotion.matches && parseFloat(reducedMotion.duration) > 0 && parseFloat(reducedMotion.duration) < 0.05,
    `matches=${reducedMotion.matches} transition-duration=${reducedMotion.duration}`
  );
  await page.emulateMediaFeatures([]);

  // #14: screen-reader announcements on every phase/status change. The live
  // region must exist AND carry non-empty text — an empty aria-live div
  // announces nothing, which is the classic way this claim silently rots.
  const live = await page.evaluate(() => {
    const el = document.querySelector('[aria-live="assertive"]');
    return el ? (el.textContent || '').trim() : '';
  });
  check(
    'assertive live region exists and carries announcement text [claim:aria-live]',
    live.length > 0,
    JSON.stringify(live.slice(0, 60))
  );

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
    'preference controls present (volume / test sound / test haptics / auto-pause) [claim:prefs]',
    prefs.volume && prefs.testSound && prefs.testHaptics && prefs.autoPause
  );
  check('timer exposes aria-valuenow progress', prefs.progressbar);

  // ---- 3. manifest ---------------------------------------------------
  const manifest = await page.evaluate(async () => {
    const response = await fetch('manifest.webmanifest');
    return response.ok ? response.json() : null;
  });
  check(
    'manifest installable (standalone, ≥2 icons, start_url) [claim:manifest]',
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
    'cold-load skeleton + iOS splash links in shell [claim:launch-polish]',
    shellHtml.includes('boot-skeleton') && splashLinks >= 3,
    `${splashLinks} splash links`
  );
  const splashOk = await page.evaluate(
    () => fetch('./splash/splash-1170x2532.png').then((r) => r.ok && r.headers.get('content-type')?.startsWith('image'))
  );
  check('splash launch image served', !!splashOk);

  // GitHub Pages serves 404.html for unknown paths; it must redirect back to the
  // app root or a mistyped URL dead-ends on a blank page.
  const notFoundOk = await page.evaluate(() =>
    fetch('./404.html')
      .then((r) => r.text())
      .then((html) => /location\.replace/.test(html))
      .catch(() => false)
  );
  check('404.html insurance redirect is served [claim:spa-404]', notFoundOk);

  // ---- 4. service worker --------------------------------------------
  const swActive = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return !!registration.active;
  });
  check('service worker active [claim:sw]', swActive);

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
  check('3-2-1 get-ready countdown appears on Start [claim:countdown]', countdownShown);
  await page.waitForSelector('button[aria-label="Pause timer"]', { timeout: 9000 });
  check('timer starts after countdown (pause button visible) [claim:engine]', true);
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
  check('session summary shows after finish [claim:summary]', hasSummary);

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
  check('presets export/import controls present [claim:preset-io]', hasIo);
  // Prove the new preset features actually rendered (EMOM builtin + duplicate)
  const presetFeatures = await page.evaluate(() => ({
    emom: (document.body.innerText || '').includes('EMOM 10'),
    duplicate: !!document.querySelector('[aria-label^="Duplicate"]'),
  }));
  check(
    'EMOM builtin + duplicate control on presets [claim:presets]',
    presetFeatures.emom && presetFeatures.duplicate
  );
  await page.screenshot({ path: join(SHOTS, 'presets-screen.png') });

  // history tab screenshot (with the session we just finished)
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('History'))?.click();
  });
  await sleep(300);
  await page.screenshot({ path: join(SHOTS, 'history-screen.png') });

  // ---- user-friendly: search + a reversible clear ---------------------
  const setSearch = (value) =>
    page.evaluate((text) => {
      const input = document.querySelector('input[aria-label="Search history"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (!setter) return false;
      setter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, value);

  const searchInputFound = await setSearch('zzz-no-such-session');
  await sleep(300);
  const noMatch = await page.evaluate(() => ({
    rows: document.querySelector('main ul')?.querySelectorAll('li').length ?? 0,
    hint: (document.body.innerText || '').includes('No sessions match'),
  }));
  check(
    'history search narrows the list and admits when nothing matches [claim:history-search]',
    searchInputFound && noMatch.rows === 0 && noMatch.hint,
    JSON.stringify(noMatch)
  );

  await setSearch('');
  await sleep(300);
  const rowsBack = await page.evaluate(
    () => document.querySelector('main ul')?.querySelectorAll('li').length ?? 0
  );
  check('clearing the search restores the sessions', rowsBack >= 1, `${rowsBack} rows`);

  // Switching tabs must never drop you back in mid-scroll.
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Timer'))?.click();
  });
  await sleep(300);
  await page.evaluate(() => window.scrollTo(0, 99999));
  await sleep(150);
  const scrolledFrom = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('History'))?.click();
  });
  await sleep(300);
  const scrolledTo = await page.evaluate(() => window.scrollY);
  check(
    'switching tabs scrolls back to the top [claim:tab-top]',
    scrolledFrom > 0 && scrolledTo === 0,
    `scrolled to ${scrolledFrom}px, tab switch left ${scrolledTo}px`
  );

  // Two-tap clear, then the Undo the toast offers must actually work —
  // an Undo that does nothing is worse than no Undo at all.
  const historyBefore = await page.evaluate(
    () => JSON.parse(localStorage.getItem('beep.history.v1') || '[]').length
  );
  const clickClear = () =>
    page.evaluate(() => {
      const labels = ['Clear', 'Tap again to clear'];
      [...document.querySelectorAll('button')]
        .find((b) => labels.includes((b.textContent || '').trim()))
        ?.click();
    });
  await clickClear();
  await sleep(150);
  await clickClear();
  await sleep(300);
  const cleared = await page.evaluate(() => ({
    left: JSON.parse(localStorage.getItem('beep.history.v1') || '[]').length,
    undo: [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Undo'),
  }));
  check(
    'clear history clears AND offers Undo [claim:undo]',
    historyBefore > 0 && cleared.left === 0 && cleared.undo,
    JSON.stringify({ historyBefore, ...cleared })
  );
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Undo')
      ?.click();
  });
  await sleep(300);
  const afterUndo = await page.evaluate(
    () => JSON.parse(localStorage.getItem('beep.history.v1') || '[]').length
  );
  check('Undo puts the cleared history back [claim:undo]', afterUndo === historyBefore, `${afterUndo}/${historyBefore}`);

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

  // ---- cues & settings pack: cue themes + configurable countdown -------
  const themeLabels = ['Beep', 'Chime', 'Click'];
  const themeButtons = await page.$$eval('button[aria-label^="Cue sound:"]', (buttons) =>
    buttons.map((b) => ({
      label: b.getAttribute('aria-label'),
      pressed: b.getAttribute('aria-pressed'),
    }))
  );
  check(
    'cue sound theme selector (Beep / Chime / Click) present [claim:cues]',
    themeLabels.every((label) => themeButtons.some((b) => b.label === `Cue sound: ${label}`)) &&
      themeButtons.length === 3,
    JSON.stringify(themeButtons.map((b) => b.label))
  );

  await page.click('button[aria-label="Cue sound: Chime"]');
  await sleep(200);
  await page.reload({ waitUntil: 'networkidle0', timeout: 20000 });
  const themeAfterReload = await page.evaluate(() => ({
    pressed: document
      .querySelector('button[aria-label="Cue sound: Chime"]')
      ?.getAttribute('aria-pressed'),
    saved: JSON.parse(localStorage.getItem('beep.settings.v1') || '{}').soundTheme,
  }));
  check(
    'cue sound theme switch persists through a reload [claim:cues]',
    themeAfterReload.pressed === 'true' && themeAfterReload.saved === 'chime',
    JSON.stringify(themeAfterReload)
  );
  // Put the default back so everything downstream hears the original beep.
  await page.click('button[aria-label="Cue sound: Beep"]');

  const readyButtons = await page.$$eval(
    'button[aria-label^="Get-ready countdown:"]',
    (buttons) => buttons.map((b) => b.getAttribute('aria-label'))
  );
  check(
    'get-ready countdown length control offers off / 3s / 5s / 10s [claim:countdown-len]',
    ['off', '3 seconds', '5 seconds', '10 seconds'].every((option) =>
      readyButtons.includes(`Get-ready countdown: ${option}`)
    ),
    JSON.stringify(readyButtons)
  );

  // Off means OFF: Start must land straight in the engine, no GET READY.
  await page.click('button[aria-label="Get-ready countdown: off"]');
  // The prefs card sits below the ring — scroll back to the top first, or the
  // sticky header can swallow the Start click after the deep scroll above.
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(250);
  await page.click('button[aria-label="Start timer"]');
  let startedStraightAway = true;
  try {
    await page.waitForSelector('button[aria-label="Pause timer"]', { timeout: 2500 });
  } catch {
    startedStraightAway = false;
  }
  const readyShown = await page.evaluate(() =>
    (document.body.innerText || '').includes('GET READY')
  );
  const startDiag = await page.evaluate(() => ({
    primary:
      document
        .querySelector('button[aria-label="Start timer"], button[aria-label="Pause timer"]')
        ?.getAttribute('aria-label') ?? null,
    scrollY: window.scrollY,
    getReadySec: JSON.parse(localStorage.getItem('beep.settings.v1') || '{}').getReadySec,
  }));
  check(
    'countdown length set to Off starts the engine with no 3-2-1 [claim:countdown-len]',
    startedStraightAway && !readyShown,
    JSON.stringify({ startedStraightAway, readyShown, ...startDiag })
  );

  await page.click('button[aria-label="Reset timer"]');
  await page.click('button[aria-label="Get-ready countdown: 3 seconds"]');
  const readyRestored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('beep.settings.v1') || '{}').getReadySec
  );
  check(
    'countdown length switch persists (3s default restored) [claim:countdown-len]',
    readyRestored === 3,
    String(readyRestored)
  );

  // ---- one-file backup: download it, then restore a modified copy ------
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => (b.textContent || '').includes('Presets'))?.click();
  });
  await sleep(300);
  const backupControls = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
    return {
      backup: labels.some((t) => t.includes('Full backup')),
      restore: labels.some((t) => t === 'Restore'),
    };
  });
  check(
    'full backup + restore controls exist on the Presets screen [claim:backup]',
    backupControls.backup && backupControls.restore,
    JSON.stringify(backupControls)
  );

  const dlDir = join(ROOT, 'node_modules', '.beep-backup-dl');
  rmSync(dlDir, { recursive: true, force: true });
  mkdirSync(dlDir, { recursive: true });
  const dlClient = await page.createCDPSession();
  await dlClient.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir });
  await page.click('button[aria-label="Full backup"]');
  let backupText = '';
  for (let i = 0; i < 50 && !backupText; i += 1) {
    await sleep(100);
    try {
      const files = readdirSync(dlDir).filter((f) => f.endsWith('.json'));
      if (files.length > 0) backupText = readFileSync(join(dlDir, files[0]), 'utf8');
    } catch {
      /* download still in flight */
    }
  }
  let backupFile = null;
  try {
    backupFile = JSON.parse(backupText);
  } catch {
    backupFile = null;
  }
  check(
    'Full backup downloads one JSON file with presets, history and settings [claim:backup]',
    !!backupFile &&
      backupFile.kind === 'backup' &&
      Array.isArray(backupFile.presets) &&
      Array.isArray(backupFile.history) &&
      typeof backupFile.settings === 'object' &&
      backupFile.settings !== null,
    backupText ? `${backupText.length} bytes` : 'no download arrived'
  );

  if (backupFile) {
    // Round trip: add one session + one preset + two settings to the file we
    // just downloaded, restore THAT, and require all of it to land.
    const modified = {
      ...backupFile,
      presets: [
        ...backupFile.presets,
        {
          id: 'smoke-backup-preset',
          name: 'Smoke backup preset',
          workSec: 20,
          restSec: 10,
          rounds: 3,
          builtin: false,
        },
      ],
      history: [
        ...backupFile.history,
        {
          id: 'smoke-fb-session',
          presetName: 'Smoke backup fixture',
          finishedAt: new Date().toISOString(),
          plannedSeconds: 120,
          elapsedSeconds: 120,
          rounds: 4,
          completed: true,
          workSec: 30,
          restSec: 30,
        },
      ],
      settings: { ...backupFile.settings, getReadySec: 5, soundTheme: 'click' },
    };
    const injected = await page.evaluate(async (json) => {
      const input = document.querySelector('input[aria-label="Restore full backup"]');
      if (!input) return 'no input';
      const transfer = new DataTransfer();
      transfer.items.add(new File([json], 'beep-backup-roundtrip.json', { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    }, JSON.stringify(modified));

    let restoreStatus = '';
    for (let i = 0; i < 50 && !restoreStatus.includes('Restored'); i += 1) {
      await sleep(100);
      restoreStatus = await page
        .$eval('[aria-label="Full backup status"]', (el) => el.textContent || '')
        .catch(() => '');
    }
    const landed = await page.evaluate(() => ({
      history: JSON.parse(localStorage.getItem('beep.history.v1') || '[]'),
      presets: JSON.parse(localStorage.getItem('beep.presets.v1') || '[]'),
      settings: JSON.parse(localStorage.getItem('beep.settings.v1') || '{}'),
    }));
    check(
      'restore merges sessions, presets and settings from the backup file [claim:backup]',
      injected === 'ok' &&
        restoreStatus.includes('Restored') &&
        landed.history.some((e) => e.id === 'smoke-fb-session') &&
        landed.presets.some((p) => p.id === 'smoke-backup-preset') &&
        landed.settings.getReadySec === 5 &&
        landed.settings.soundTheme === 'click',
      JSON.stringify({
        injected,
        status: restoreStatus.slice(0, 90),
        getReadySec: landed.settings.getReadySec,
      })
    );

    // Remove the fixtures and restore the defaults so nothing downstream
    // sees test data — then land back on the Timer tab for the checks after.
    await page.evaluate(() => {
      const history = JSON.parse(localStorage.getItem('beep.history.v1') || '[]').filter(
        (entry) => entry.id !== 'smoke-fb-session'
      );
      localStorage.setItem('beep.history.v1', JSON.stringify(history));
      const presets = JSON.parse(localStorage.getItem('beep.presets.v1') || '[]').filter(
        (preset) => preset.id !== 'smoke-backup-preset'
      );
      localStorage.setItem('beep.presets.v1', JSON.stringify(presets));
      const settings = JSON.parse(localStorage.getItem('beep.settings.v1') || '{}');
      settings.getReadySec = 3;
      settings.soundTheme = 'beep';
      localStorage.setItem('beep.settings.v1', JSON.stringify(settings));
    });
  }
  // Chrome can hold the downloaded file for a moment — retry instead of
  // leaking a lock-timeout error into an otherwise green run.
  await removeScratchDir(dlDir);
  // Land back on the Timer tab, idle, with the defaults restored — the checks
  // after this point assume a fresh shell (3-2-1 countdown, no test data).
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });

  // ---- user-friendly: hardware-keyboard shortcuts + help sheet ---------
  // Focus must be on the page itself, not a control, or Space belongs to that
  // control (by design) and the check would be asserting the wrong thing.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.keyboard.press('Space');
  await sleep(400);
  const afterSpace = await page.evaluate(() => ({
    countdown: (document.body.innerText || '').includes('GET READY'),
    title: document.title,
  }));
  check(
    'SPACE starts the session via the 3-2-1 countdown [claim:shortcuts]',
    afterSpace.countdown,
    JSON.stringify(afterSpace)
  );
  await page.keyboard.press('Space');
  await sleep(300);
  check(
    'SPACE again cancels the countdown [claim:shortcuts]',
    await page.evaluate(() => !(document.body.innerText || '').includes('GET READY'))
  );

  await page.keyboard.type('?');
  await sleep(300);
  const helpShown = await page.evaluate(() => ({
    dialog: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
    // innerText is rendered text — the heading is CSS-uppercased.
    shortcuts: (document.body.innerText || '').toLowerCase().includes('keyboard shortcuts'),
  }));
  check(
    'the ? key opens the help sheet [claim:help]',
    helpShown.dialog && helpShown.shortcuts,
    JSON.stringify(helpShown)
  );
  await page.keyboard.press('Escape');
  await sleep(300);
  check(
    'Escape closes the help sheet [claim:help]',
    await page.evaluate(() => !document.querySelector('[role="dialog"][aria-modal="true"]'))
  );

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

  // The session keeps following you outside the ring: the tab title and the
  // tab-bar pill both carry the live countdown.
  const followAlong = await page.evaluate(() => ({
    title: document.title,
    pill: (document.querySelector('nav')?.innerText || '').includes('·'),
  }));
  check(
    'live countdown in the tab title AND the tab-bar pill [claim:tab-title]',
    followAlong.title.includes('·') && followAlong.title.includes('Beep') && followAlong.pill,
    JSON.stringify(followAlong)
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

  // The other half of the #3 guardrail: Android's back button mid-session must
  // pause and confirm, never silently discard. Safe to simulate because the
  // app re-pushes its state inside popstate — if that guard ever regresses,
  // this navigates away and the check fails loudly instead of hanging.
  const urlBeforeBack = page.url();
  await page.evaluate(() => window.history.back());
  await sleep(600);
  const backGuard = await page.evaluate(() => ({
    dialog: (document.body.innerText || '').includes('Stop this session?'),
  }));
  check(
    'back button mid-session pauses and confirms instead of discarding [claim:back-guard]',
    backGuard.dialog && page.url() === urlBeforeBack,
    page.url() === urlBeforeBack ? 'no navigation' : `navigated to ${page.url()}`
  );
  // Leave the session running for the resume test below.
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Keep going'))?.click();
  });
  await sleep(400);

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
  // Seed two entries with very different durations first. Without this the
  // smoke's own sessions are all similar length, so asserting "the sort changed
  // the order" would be luck, not a check — the kind of green that means
  // nothing. Reload so the app re-reads localStorage into state.
  await page.evaluate(() => {
    const key = 'beep.history.v1';
    const now = Date.now();
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const seed = (id, presetName, elapsedSeconds, daysAgo) => ({
      id,
      presetId: `seed-${id}`,
      presetName,
      label: '',
      rounds: 8,
      completed: true,
      elapsedSeconds,
      workSec: 20,
      restSec: 10,
      startedAt: now - daysAgo * 86400000,
      finishedAt: now - daysAgo * 86400000,
    });
    localStorage.setItem(
      key,
      JSON.stringify([
        seed('seed-short', 'Tabata', 30, 3),
        seed('seed-long', 'HIIT 45/15', 900, 2),
        ...existing,
      ])
    );
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(400);
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
    // The streak card renders only when streak >= 1; every session this run
    // finished is dated today, so it must show a real (non-zero) day count.
    streak: /\b[1-9]\d*-day streak\b/.test(document.body.innerText || ''),
    // #8 sort toggle — asserted by its stateful aria-label, then flipped so the
    // claim covers the control *and* that it actually re-orders.
    sortToggle: !!document.querySelector('[aria-label^="Sorted newest first"]'),
  }));
  check(
    'history: run-again + filter + weekly total + export + label (#8/#16/#19)',
    historyUi.runAgain &&
      historyUi.filter &&
      historyUi.weekly &&
      historyUi.exportBtn &&
      historyUi.label,
    JSON.stringify(historyUi)
  );
  check('streak counter renders a real day count [claim:streak]', historyUi.streak);
  check('history sort toggle exists (#8)', historyUi.sortToggle);

  // Flip the sort and prove the order actually changes — a control that exists
  // but does nothing would pass a presence check forever.
  const readOrder = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[aria-label$="again"]')].map((b) =>
        (b.closest('li')?.innerText || b.parentElement?.innerText || '').slice(0, 40)
      )
    );
  const orderBefore = await readOrder();
  await page.evaluate(() => document.querySelector('[aria-label^="Sorted newest first"]')?.click());
  await sleep(400);
  const orderAfter = await readOrder();
  const sortFlipped = await page.evaluate(() =>
    !!document.querySelector('[aria-label^="Sorted longest first"]')
  );
  check(
    'history sort toggle flips newest/longest (#8/#19)',
    sortFlipped && JSON.stringify(orderBefore) !== JSON.stringify(orderAfter),
    `${sortFlipped ? 'label flipped' : 'toggle did not respond'}; order ${sortFlipped && JSON.stringify(orderBefore) !== JSON.stringify(orderAfter) ? 'changed' : 'unchanged'}`
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
  check('update toast appears when sw.js bytes change [claim:update-toast]', toastShown);

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
  // Sweep the backup-download scratch dir once the browser has released it.
  await removeScratchDir(join(ROOT, 'node_modules', '.beep-backup-dl'));
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
