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

  // ---- 4. service worker --------------------------------------------
  const swActive = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return !!registration.active;
  });
  check('service worker active', swActive);

  await page.screenshot({ path: join(SHOTS, 'timer-screen.png') });

  // ---- 5. run a session end-to-end ----------------------------------
  await page.click('button[aria-label="Start timer"]');
  await sleep(1500);
  check('timer starts (pause button visible)', !!(await page.$('button[aria-label="Pause timer"]')));

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
  await page.screenshot({ path: join(SHOTS, 'presets-screen.png') });

  // history tab screenshot (with the session we just finished)
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('History'))?.click();
  });
  await sleep(300);
  await page.screenshot({ path: join(SHOTS, 'history-screen.png') });

  check('no console/page errors (online phase)', errors.length === 0, errors.join(' | '));

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
  await sleep(1200);
  const runsOffline = !!(await page.$('button[aria-label="Pause timer"]'));
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
