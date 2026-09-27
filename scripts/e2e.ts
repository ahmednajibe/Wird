/**
 * End-to-end check of the production build.
 *
 * Starts `dist/server/index.js` on a free port with a throwaway database
 * (LEARNING_DB_PATH), drives the local Microsoft Edge through playwright-core
 * (no browser download), runs the core flows, then writes full-page
 * screenshots of every page to screenshots/ (desktop 1440x900, mobile 390x844,
 * plus Today in the light theme).
 *
 * Run with `npm run e2e` (builds first).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const shotsDir = join(root, 'screenshots');

const PAGES: [string, string][] = [
  ['today', '/'],
  ['plan', '/plan'],
  ['tracks', '/tracks'],
  ['quran', '/quran'],
  ['stats', '/stats'],
  ['resources', '/resources'],
  ['settings', '/settings'],
];

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => res(port));
    });
  });
}

async function waitForHealth(base: string, proc: ChildProcess, timeoutMs = 20_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (proc.exitCode !== null) throw new Error(`server exited early with code ${proc.exitCode}`);
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not become healthy in time');
}

const POINTS_JS = 'Number(document.querySelector("[data-testid=points-today]")?.getAttribute("data-value"))';

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  process.stdout.write(`  - ${name} ... `);
  try {
    await fn();
    passed++;
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    throw err;
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

async function numberAttr(page: Page, selector: string): Promise<number> {
  const v = await page.locator(selector).first().getAttribute('data-value');
  return Number(v);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction('document.querySelectorAll(".skeleton").length === 0', undefined, { timeout: 15_000 });
  await page.waitForTimeout(700);
}

async function run(): Promise<void> {
  if (!existsSync(join(root, 'dist', 'server', 'index.js')) || !existsSync(join(root, 'dist', 'web', 'index.html'))) {
    throw new Error('dist is missing: run `npm run build` first (npm run e2e does this)');
  }
  const tmp = mkdtempSync(join(tmpdir(), 'learning-e2e-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'dist/server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), LEARNING_DB_PATH: join(tmp, 'e2e.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout?.on('data', (d: Buffer) => (serverLog += d.toString()));
  server.stderr?.on('data', (d: Buffer) => (serverLog += d.toString()));

  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  const watch = (page: Page) => {
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(e.message));
  };
  try {
    await waitForHealth(base, server);
    console.log(`Server on ${base} (db in ${tmp})`);
    browser = await chromium.launch({ channel: 'msedge', headless: true });

    const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    watch(page);

    console.log('Flows');
    await check('Today renders with the Quran task first', async () => {
      await page.goto(`${base}/`);
      await page.locator('[data-testid="task-card"]').first().waitFor();
      const first = await page.locator('[data-testid="task-card"]').first().getAttribute('data-track');
      assert(first === 'quran', `first task track is ${first}`);
      assert(await page.locator('[data-testid="goal-card"]').isVisible(), 'goal ring visible');
      assert(await page.locator('[data-testid="streak-card"]').isVisible(), 'streak card visible');
      assert((await page.locator('[data-testid="week-strip"] button').count()) === 7, 'week strip has 7 days');
    });

    let points = 0;
    await check('Completing a task increases the points counter', async () => {
      points = await numberAttr(page, '[data-testid="points-today"]');
      const card = page.locator('[data-testid="task-card"][data-status="pending"]').first();
      await card.locator('[data-testid="task-complete"]').click();
      await page.waitForFunction(`${POINTS_JS} > ${points}`);
      await page.waitForLoadState('networkidle');
      const after = await numberAttr(page, '[data-testid="points-today"]');
      const api = (await (await fetch(`${base}/api/dashboard`)).json()) as { pointsToday: number };
      assert(after > points, `points went from ${points} to ${after}`);
      assert(api.pointsToday === after, `UI ${after} matches API ${api.pointsToday}`);
      points = after;
    });

    await check('Manual task shows a computed points preview and adds points', async () => {
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('n');
      await page.locator('[data-testid="add-task-form"]').waitFor();
      await page.locator('#task-title').fill('E2E: read a chapter on indexes');
      await page.locator('#task-minutes').fill('45');
      await page.waitForFunction('Number(document.querySelector("[data-testid=preview-points]")?.getAttribute("data-value")) > 0');
      await page.waitForTimeout(500); // debounce settles on the final input
      const preview = await numberAttr(page, '[data-testid="preview-points"]');
      const text = await page.locator('[data-testid="points-preview"]').innerText();
      assert(text.includes('Points are calculated automatically'), 'preview label present');
      await page.locator('[data-testid="add-task-submit"]').click();
      await page.locator('[data-testid="add-task-form"]').waitFor({ state: 'detached' });
      await page.waitForFunction(`${POINTS_JS} === ${points + preview}`, undefined, { timeout: 10_000 });
      points += preview;
    });

    await check('Plan shows 7 day cards', async () => {
      await page.goto(`${base}/plan`);
      await page.locator('[data-testid="day-card"]').first().waitFor();
      const n = await page.locator('[data-testid="day-card"]').count();
      assert(n === 7, `found ${n} day cards`);
      await page.locator('[data-testid="why-panel"]').waitFor();
    });

    await check('Quran grid has 604 cells', async () => {
      await page.goto(`${base}/quran`);
      await page.locator('[data-testid="quran-grid"]').waitFor();
      const n = await page.locator('[data-testid="quran-cell"]').count();
      assert(n === 604, `found ${n} cells`);
    });

    await check('Settings save round-trips', async () => {
      await page.goto(`${base}/settings`);
      const field = page.locator('[data-testid="field-cap-0"]');
      await field.waitFor();
      await field.fill('135');
      await page.locator('[data-testid="settings-save"]').click();
      await page.locator('[data-testid="saved-explanation"]').waitFor();
      const api = (await (await fetch(`${base}/api/settings`)).json()) as { capacityByDow: number[] };
      assert(api.capacityByDow[0] === 135, `API has ${api.capacityByDow[0]}`);
      await page.reload();
      await field.waitFor();
      const v = await field.inputValue();
      assert(v === '135', `field shows ${v} after reload`);
      // restore the default so screenshots show the normal week
      await field.fill('120');
      await page.locator('[data-testid="settings-save"]').click();
      await page.locator('[data-testid="saved-explanation"]').waitFor();
    });

    await check('Other pages render without errors', async () => {
      for (const path of ['/tracks', '/stats', '/resources']) {
        await page.goto(`${base}${path}`);
        await settle(page);
      }
      assert((await page.locator('[data-testid="resource-stream"]').count()) === 4, '4 resource streams');
    });
    await ctx.close();

    console.log('Screenshots');
    rmSync(shotsDir, { recursive: true, force: true });
    mkdirSync(shotsDir, { recursive: true });
    const sizes: [string, { width: number; height: number }][] = [
      ['desktop', { width: 1440, height: 900 }],
      ['mobile', { width: 390, height: 844 }],
    ];
    for (const [label, viewport] of sizes) {
      const c = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce', deviceScaleFactor: 1 });
      const p = await c.newPage();
      watch(p);
      for (const [name, path] of PAGES) {
        await p.goto(`${base}${path}`);
        await settle(p);
        const file = join(shotsDir, `${name}-${label}.png`);
        await p.screenshot({ path: file, fullPage: true });
        console.log(`  ${file}`);
      }
      await p.goto(`${base}/`);
      await settle(p);
      await p.keyboard.press('n');
      await p.locator('#task-title').fill('Watched a lecture on attention');
      await p.waitForTimeout(900);
      const file = join(shotsDir, `add-task-${label}.png`);
      await p.screenshot({ path: file });
      console.log(`  ${file}`);
      await c.close();
    }
    for (const [label, viewport] of sizes) {
      const c = await browser.newContext({ viewport, colorScheme: 'light', reducedMotion: 'reduce' });
      const p = await c.newPage();
      watch(p);
      await p.goto(`${base}/`);
      await settle(p);
      const file = join(shotsDir, `today-light-${label}.png`);
      await p.screenshot({ path: file, fullPage: true });
      console.log(`  ${file}`);
      await c.close();
    }

    const relevant = consoleErrors.filter((e) => !/favicon/i.test(e));
    if (relevant.length > 0) {
      console.log('Browser console errors:');
      for (const e of relevant) console.log(`  ${e}`);
      throw new Error(`${relevant.length} browser console error(s)`);
    }
    console.log(`\nE2E passed: ${passed} checks, screenshots in ${shotsDir}`);
  } catch (err) {
    console.error('\nE2E failed:', err instanceof Error ? err.message : err);
    if (serverLog.trim()) console.error(`--- server log ---\n${serverLog}`);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill();
    await new Promise((r) => setTimeout(r, 300));
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* the db file may still be locked for a moment on Windows */
    }
  }
}

void run();
