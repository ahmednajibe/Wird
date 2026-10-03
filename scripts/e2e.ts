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
import { openDb } from '../src/server/db.js';
import { seedOwnerPlan } from '../src/server/seed/seed.js';

const root = resolve(import.meta.dirname, '..');
const shotsDir = join(root, 'screenshots');

const PAGES: [string, string][] = [
  ['today', '/'],
  ['plan', '/plan'],
  ['tracks', '/tracks'],
  ['quran', '/quran'],
  ['stats', '/stats'],
  ['resources', '/tracks?view=resources'],
  ['import', '/import'],
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
  const dbPath = join(tmp, 'e2e.db');
  // Fresh installs have no study curriculum; seed the owner plan like a migrated DB.
  {
    const db = openDb(dbPath);
    seedOwnerPlan(db);
    db.close();
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'dist/server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), LEARNING_DB_PATH: dbPath },
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
    rmSync(shotsDir, { recursive: true, force: true });
    mkdirSync(shotsDir, { recursive: true });
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
      assert((await page.locator('[data-testid="week-strip"] > *').count()) === 7, 'week strip has 7 days');
      const dash = (await (await fetch(`${base}/api/dashboard`)).json()) as { trackingStartDate: string; today: string; weekSummary: { beforeStart: boolean }[] };
      assert(dash.trackingStartDate === dash.today, `fresh database starts tracking today (${dash.trackingStartDate})`);
      const notStarted = await page.locator('[data-testid="week-day-not-started"]').count();
      const expected = dash.weekSummary.filter((d) => d.beforeStart).length;
      assert(notStarted === expected, `${notStarted} not-started days shown, API says ${expected}`);
    });

    await check('Intro card dismisses and stays dismissed', async () => {
      const card = page.locator('[data-testid="intro-card"]');
      await card.waitFor();
      assert(await card.isVisible(), 'intro card visible on a fresh context');
      await page.locator('[data-testid="intro-dismiss"]').click();
      assert((await card.count()) === 0, 'intro card hidden after dismiss');
      await page.reload();
      await page.locator('[data-testid="task-card"]').first().waitFor();
      assert((await page.locator('[data-testid="intro-card"]').count()) === 0, 'intro card stays hidden after reload');
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

    await check('Skip moves a study session forward in its own track', async () => {
      await page.goto(`${base}/`);
      await settle(page);
      const card = page.locator('[data-testid="task-card"][data-status="pending"]:not([data-track="quran"])').first();
      const title = await card.locator('h3').innerText();
      const before = (await (await fetch(`${base}/api/dashboard`)).json()) as { tasks: { id: number; title: string; track: string; stream: string; plannedMinutes: number }[] };
      const task = before.tasks.find((t) => t.title === title);
      assert(task, `task "${title}" found in the API`);
      await card.locator('[data-testid="task-skip"]').click();
      await page.locator('[data-testid="task-card"][data-status="rolled"] [data-testid="task-rolled"]').first().waitFor();
      await page.waitForLoadState('networkidle');
      const rolledCard = page.locator('[data-testid="task-card"][data-status="rolled"]').first();
      assert((await rolledCard.locator('[data-testid="task-complete"]').count()) === 0, 'rolled task has no Complete button');
      const after = (await (await fetch(`${base}/api/dashboard`)).json()) as { tasks: { id: number; status: string }[] };
      assert(after.tasks.find((t) => t.id === task.id)?.status === 'rolled', 'API reports the task as rolled');
      const pts = await numberAttr(page, '[data-testid="points-today"]');
      assert(pts === points, `points unchanged by the move (${pts} vs ${points})`);
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
      for (const path of ['/tracks', '/stats', '/tracks?view=resources']) {
        await page.goto(`${base}${path}`);
        await settle(page);
      }
      assert((await page.locator('[data-testid="resource-stream"]').count()) === 4, '4 resource streams');
      assert((await page.locator('nav a[href="/resources"]').count()) === 0, 'no nav link to /resources');
      assert((await page.locator('nav a[href="/import"]').count()) === 0, 'no nav link to /import');
      await page.goto(`${base}/resources`);
      await settle(page);
      const url = page.url();
      assert(url.includes('/tracks') && url.includes('view=resources'), `/resources redirected to ${url}`);
      assert((await page.locator('[data-testid="resource-stream"]').count()) > 0, 'resource streams shown after the redirect');
    });

    await check('Import page reports invalid packs', async () => {
      await page.goto(`${base}/import`);
      await page.locator('[data-testid="pack-input"]').waitFor();
      await page.locator('[data-testid="pack-input"]').fill('{ "version": 2');
      await page.locator('[data-testid="preview-button"]').click();
      await page.locator('[data-testid="parse-error"]').waitFor();
      const msg = await page.locator('[data-testid="parse-error"]').innerText();
      assert(/Not valid JSON near line \d+, column \d+/.test(msg), `parse error text: ${msg}`);
      await page.locator('[data-testid="pack-input"]').fill(JSON.stringify({ version: 2, name: 'Bad', tracks: [] }));
      await page.locator('[data-testid="preview-button"]').click();
      await page.locator('[data-testid="preview-errors"]').waitFor();
      assert((await page.locator('[data-testid="preview-error-list"] li').count()) > 0, 'error list non-empty');
      await page.screenshot({ path: join(shotsDir, 'import-errors-desktop.png'), fullPage: true });
    });

    await check('Importing a pack adds a German track end to end', async () => {
      const pack = (await (await fetch(`${base}/api/plan-pack`)).json()) as {
        tracks: unknown[];
        modules: unknown[];
        settings: { weeklyTemplate: Record<string, unknown>[][] };
      };
      pack.tracks.push({
        id: 'german',
        kind: 'study',
        label: 'German',
        shortLabel: 'German',
        theme: 'green',
        icon: 'translate',
        streams: [{ id: 'main', label: 'Main', style: 'study' }],
      });
      pack.modules.push({ id: 'de-a1', track: 'german', stream: 'main', phase: { id: 'G1', title: 'Basics' }, title: 'German A1', estMinutes: 120 });
      for (const day of pack.settings.weeklyTemplate) day.unshift({ track: 'german', stream: 'main', role: 'focus', kind: 'fixed', minutes: 20 });
      await page.locator('[data-testid="pack-input"]').fill(JSON.stringify(pack));
      await page.locator('[data-testid="preview-button"]').click();
      await page.locator('[data-testid="preview-ok"]').waitFor();
      await page.screenshot({ path: join(shotsDir, 'import-preview-desktop.png'), fullPage: true });
      await page.locator('[data-testid="commit-button"]').click();
      await page.waitForURL(`${base}/`);
      await page.locator('[data-testid="task-card"][data-track="german"]').first().waitFor();
      const card = page.locator('[data-testid="task-card"][data-track="german"]').first();
      assert((await card.locator('[class*="text-green-ink"]').count()) > 0, 'German task carries the green theme');
      await page.goto(`${base}/plan`);
      await settle(page);
      assert((await page.locator('text=German A1').count()) > 0, 'Plan page shows a German task');
      assert((await page.locator('[class*="text-green-ink"]').count()) > 0, 'Plan page shows the green accent');
    });

    await check('Turning Quran off hides its nav entry and tasks', async () => {
      await page.goto(`${base}/settings`);
      const toggle = page.locator('#quran-enabled');
      await toggle.waitFor();
      assert((await toggle.getAttribute('aria-checked')) === 'true', 'Quran starts enabled');
      await toggle.click();
      await page.locator('[data-testid="settings-save"]').click();
      await page.locator('[data-testid="saved-explanation"]').waitFor();
      await page.screenshot({ path: join(shotsDir, 'settings-quran-desktop.png'), fullPage: true });
      await page.goto(`${base}/`);
      await settle(page);
      assert((await page.locator('nav a[href="/quran"]').count()) === 0, 'Quran nav entry hidden');
      // Completed Quran work is history and stays; only pending generated sessions are removed.
      assert((await page.locator('[data-testid="task-card"][data-track="quran"][data-status="pending"]').count()) === 0, 'no pending Quran task today');
      // Restore for the remaining flows and screenshots.
      await page.goto(`${base}/settings`);
      await toggle.waitFor();
      await toggle.click();
      await page.locator('[data-testid="settings-save"]').click();
      await page.locator('[data-testid="saved-explanation"]').waitFor();
    });

    await check('Arabic switches the UI to RTL', async () => {
      await page.goto(`${base}/settings`);
      const langAr = page.locator('[data-testid="lang-ar"]');
      await langAr.waitFor();
      await langAr.click();
      await page.waitForFunction('document.documentElement.dir === "rtl" && document.documentElement.lang === "ar"');
      await page.goto(`${base}/`);
      await settle(page);
      assert((await page.locator('nav').filter({ hasText: 'اليوم' }).count()) > 0, 'sidebar nav shows اليوم');
      const firstTitle = await page.locator('[data-testid="task-card"] h3').first().innerText();
      assert(!firstTitle.includes('Deep study') && !firstTitle.includes('Memorize page'), `first task card title is Arabic (${firstTitle})`);
      const headerText = await page.locator('main header').first().innerText();
      assert(headerText.includes('هـ'), `header shows the Arabic Hijri label (${headerText.split('\n')[0]})`);
      let file = join(shotsDir, 'today-ar-desktop.png');
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  ${file}`);

      const arCtx = await browser!.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
      await arCtx.addInitScript(() => {
        try {
          localStorage.setItem('wird-lang', 'ar');
        } catch {
          /* storage unavailable */
        }
      });
      const arPage = await arCtx.newPage();
      watch(arPage);
      await arPage.goto(`${base}/`);
      await settle(arPage);
      file = join(shotsDir, 'today-ar-mobile.png');
      await arPage.screenshot({ path: file, fullPage: true });
      console.log(`  ${file}`);
      await arCtx.close();

      await page.goto(`${base}/settings`);
      const langEn = page.locator('[data-testid="lang-en"]');
      await langEn.waitFor();
      await langEn.click();
      await page.waitForFunction('document.documentElement.dir === "ltr" && document.documentElement.lang === "en"');
    });
    await ctx.close();

    console.log('Screenshots');
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
        if (viewport.width === 390) {
          const w = Number(await p.evaluate('document.documentElement.scrollWidth'));
          assert(w <= 390, `${name} mobile (en) overflows: scrollWidth ${w} > 390`);
        }
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

    await check('Arabic screenshots cover every page', async () => {
      for (const [label, viewport] of sizes) {
        const arCtx = await browser!.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce', deviceScaleFactor: 1 });
        await arCtx.addInitScript(() => {
          try {
            localStorage.setItem('wird-lang', 'ar');
          } catch {
            /* storage unavailable */
          }
        });
        const p = await arCtx.newPage();
        watch(p);
        for (const [name, path] of PAGES) {
          await p.goto(`${base}${path}`);
          await settle(p);
          await p.waitForFunction('document.documentElement.dir === "rtl" && document.documentElement.lang === "ar"', undefined, { timeout: 10_000 });
          if (viewport.width === 390) {
            const w = Number(await p.evaluate('document.documentElement.scrollWidth'));
            assert(w <= 390, `${name} mobile (ar) overflows: scrollWidth ${w} > 390`);
          }
          const file = join(shotsDir, `${name}-ar-${label}.png`);
          await p.screenshot({ path: file, fullPage: true });
          console.log(`  ${file}`);
        }
        await arCtx.close();
      }
    });

    await check('Settings advanced and plan why panels in both languages', async () => {
      for (const lang of ['en', 'ar'] as const) {
        const c = await browser!.newContext({ viewport: { width: 1024, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce', deviceScaleFactor: 1 });
        if (lang === 'ar') {
          await c.addInitScript(() => {
            try {
              localStorage.setItem('wird-lang', 'ar');
            } catch {
              /* storage unavailable */
            }
          });
        }
        const p = await c.newPage();
        watch(p);
        await p.goto(`${base}/settings`);
        await settle(p);
        if (lang === 'ar') await p.waitForFunction('document.documentElement.dir === "rtl" && document.documentElement.lang === "ar"', undefined, { timeout: 10_000 });
        await p.locator('[data-testid="settings-advanced"] button[aria-expanded]').click();
        await p.locator('[data-testid="field-b-factor"]').waitFor();
        let file = join(shotsDir, lang === 'ar' ? 'settings-advanced-1024-ar.png' : 'settings-advanced-1024.png');
        await p.screenshot({ path: file, fullPage: true });
        console.log(`  ${file}`);
        await p.setViewportSize({ width: 1440, height: 900 });
        await p.goto(`${base}/plan`);
        await settle(p);
        await p.locator('[data-testid="why-panel"] button[aria-expanded]').click();
        await p.locator('[data-testid="baseline-text"]').waitFor();
        file = join(shotsDir, lang === 'ar' ? 'plan-why-ar-desktop.png' : 'plan-why-desktop.png');
        await p.screenshot({ path: file, fullPage: true });
        console.log(`  ${file}`);
        await c.close();
      }
    });
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

    // Fresh install: no owner seed, so there is no study plan.
    const dbPath2 = join(tmp, 'empty.db');
    const port2 = await freePort();
    const base2 = `http://127.0.0.1:${port2}`;
    const server2 = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'dist/server/index.js'], {
      cwd: root,
      env: { ...process.env, PORT: String(port2), LEARNING_DB_PATH: dbPath2 },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      await waitForHealth(base2, server2);
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
      const p = await c.newPage();
      watch(p);
      await check('Fresh empty install shows the no-plan state', async () => {
        await p.goto(`${base2}/`);
        await p.locator('[data-testid="no-plan-card"]').waitFor();
        assert((await p.locator('a[href="/import"]').count()) > 0, 'empty state links to /import');
        const file = join(shotsDir, 'today-empty-desktop.png');
        await p.screenshot({ path: file, fullPage: true });
        console.log(`  ${file}`);
        await p.goto(`${base2}/tracks`);
        await settle(p);
        await p.locator('text=No study plan yet').first().waitFor();
        const file2 = join(shotsDir, 'tracks-empty-desktop.png');
        await p.screenshot({ path: file2, fullPage: true });
        console.log(`  ${file2}`);
      });
      await c.close();
    } finally {
      server2.kill();
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
