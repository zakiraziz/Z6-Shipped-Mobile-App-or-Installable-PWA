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
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS = join(ROOT, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const failures = [];
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures.push(name);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer() {
  return spawn('cmd.exe', ['/c', 'npm', 'run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
}
function stopServer(child) {
  try {
    execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* already gone */
  }
}

const server = startServer();
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
  await page.screenshot({ path: join(SHOTS, 'presets-screen.png') });

  // history tab screenshot (with the session we just finished)
  await page.evaluate(() => {
    [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('History'))?.click();
  });
  await sleep(300);
  await page.screenshot({ path: join(SHOTS, 'history-screen.png') });

  check('no console/page errors (online phase)', errors.length === 0, errors.join(' | '));

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
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
